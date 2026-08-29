# Lets GitHub Actions assume an IAM role via OIDC instead of long-lived access keys, so
# cd.yml can run `terraform apply` without a secret any more sensitive than a role ARN.
# One provider/role pair per AWS account (staging and production are separate accounts —
# 228615802615 and 924285051814 — so applying this module into each creates its own
# independent trust relationship). Mirrors eduverify/terraform/modules/ci_oidc's pattern;
# trimmed to what this stack actually creates (no S3 buckets, SNS, EventBridge, or Amplify —
# this stack's only resources are the serving Lambda, its IAM role, API Gateway, and usage
# plans/keys).

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]

  tags = var.tags

  # GitHub's OIDC endpoint sits behind a CDN that can present a different leaf certificate
  # on different requests, so the tls_certificate data source above recomputes a different
  # thumbprint on nearly every plan even though nothing meaningful changed — AWS doesn't
  # even validate this thumbprint for providers (like GitHub's) that support JWKS discovery.
  # Without this, every apply tries to call iam:UpdateOpenIDConnectProviderThumbprint, which
  # the CI role deliberately doesn't have (see RefreshOwnCiInfra below on why its self-mgmt
  # permissions stay read-only) and shouldn't need for a no-op update.
  lifecycle {
    ignore_changes = [thumbprint_list]
  }
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # StringLike (not Equals): GitHub's actual `sub` claim format depends on the org's
    # OIDC subject-claim customization (immutable-ID vs classic) — matching both patterns
    # keeps this working whichever is in effect. See eduverify/terraform/modules/ci_oidc's
    # identical condition for the confirmed claim shapes.
    #
    # Also includes the environment-scoped shape (repo:<owner>/<repo>:environment:<name>):
    # when a job sets `environment:` (as cd-staging.yml/cd-production.yml both do), GitHub
    # issues that shape INSTEAD OF the ref-based one above, even on a workflow_dispatch run
    # from the expected branch — omitting it is what caused AssumeRoleWithWebIdentity to be
    # denied for every real deploy run despite the ref-based patterns looking correct.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = concat(
        flatten([
          for ref in var.github_deploy_refs : [
            "repo:${var.github_repo}:ref:${ref}",
            "repo:${split("/", var.github_repo)[0]}@*/${split("/", var.github_repo)[1]}@*:ref:${ref}",
          ]
        ]),
        [
          "repo:${var.github_repo}:environment:${var.github_environment}",
          "repo:${split("/", var.github_repo)[0]}@*/${split("/", var.github_repo)[1]}@*:environment:${var.github_environment}",
        ]
      )
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_name}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  tags               = var.tags
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Exact names, NOT a project_name-prefix wildcard: this role's own name
  # (${var.project_name}-github-actions-deploy) also matches that prefix, and granting
  # iam:AttachRolePolicy/CreateRole etc. on a resource pattern that includes yourself is a
  # privilege-escalation path. List only the role/policy main.tf actually creates.
  managed_role_name   = "${var.project_name}-serving-lambda-exec-role"
  managed_policy_name = "${var.project_name}-serving-lambda-exec-role-policy"
  managed_role_arn    = "arn:aws:iam::${local.account_id}:role/${local.managed_role_name}"
  managed_policy_arn  = "arn:aws:iam::${local.account_id}:policy/${local.managed_policy_name}"

  tf_state_bucket_arn = "arn:aws:s3:::${var.tf_state_bucket_name}"
  tf_lock_table_arn   = "arn:aws:dynamodb:*:${local.account_id}:table/${var.tf_lock_table_name}"

  # Read-only Get/List actions on this module's own OIDC provider/role/policy — unlike
  # managed_role_arn/managed_policy_arn above, these can't be used to escalate privilege, so
  # granting them on the role's own ARN doesn't reintroduce the self-management risk noted above.
  self_oidc_provider_arn = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
  self_role_arn          = "arn:aws:iam::${local.account_id}:role/${var.project_name}-github-actions-deploy"
  self_policy_arn        = "arn:aws:iam::${local.account_id}:policy/${var.project_name}-github-actions-deploy-policy"

  apigw_cloudwatch_role_arn = "arn:aws:iam::${local.account_id}:role/${var.project_name}-apigw-cloudwatch-role"

  # CloudWatch Logs is inconsistent about the trailing `:*`: ListTagsForResource's actual
  # authorization check (confirmed via a real AccessDenied error) is against the bare log-group
  # ARN, with no `:*`, while the `:*`-suffixed form was needed for other actions (see the prior
  # fix commit that added it). Granting both forms covers every action in
  # ManageServingLambdaLogGroup/ManageApiGatewayAccessLogGroup without action-by-action ARN
  # splitting.
  lambda_log_group_arns = [
    "arn:aws:logs:*:${local.account_id}:log-group:/aws/lambda/${var.project_name}",
    "arn:aws:logs:*:${local.account_id}:log-group:/aws/lambda/${var.project_name}:*",
  ]
  apigw_access_log_group_arns = [
    "arn:aws:logs:*:${local.account_id}:log-group:/aws/apigateway/${var.project_name}",
    "arn:aws:logs:*:${local.account_id}:log-group:/aws/apigateway/${var.project_name}:*",
  ]
}

data "aws_iam_policy_document" "deploy_permissions" {
  statement {
    sid       = "TerraformStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.tf_state_bucket_arn}/*"]
  }

  statement {
    sid       = "TerraformStateBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = [local.tf_state_bucket_arn]
  }

  statement {
    sid       = "TerraformStateLock"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [local.tf_lock_table_arn]
  }

  statement {
    sid    = "ManageServingLambdaExecRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:TagRole",
      "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:ListPolicyVersions",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies", "iam:ListInstanceProfilesForRole", "iam:TagPolicy",
    ]
    resources = [local.managed_role_arn, local.managed_policy_arn]
  }

  statement {
    sid       = "PassServingLambdaExecRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.managed_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid    = "ManageServingLambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction", "lambda:GetFunction", "lambda:GetFunctionConfiguration",
      "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy",
      "lambda:ListVersionsByFunction", "lambda:TagResource", "lambda:ListTags",
      # aws_lambda_function's Read always calls GetFunctionCodeSigningConfig, even though
      # this project has no code signing config attached.
      "lambda:GetFunctionCodeSigningConfig",
    ]
    resources = ["arn:aws:lambda:*:${local.account_id}:function:${var.project_name}"]
  }

  statement {
    sid    = "ManageServingLambdaLogGroup"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy", "logs:TagResource", "logs:ListTagsForResource",
    ]
    resources = local.lambda_log_group_arns
  }

  statement {
    sid    = "ManageApiGatewayAccessLogGroup"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy", "logs:TagResource", "logs:ListTagsForResource",
    ]
    resources = local.apigw_access_log_group_arns
  }

  # API Gateway's account-level cloudwatch_role_arn is a singleton per account/region
  # (see modules/api_gateway/main.tf's aws_iam_role.apigw_cloudwatch comment), so this role
  # is managed by exact ARN like ManageServingLambdaExecRole above, not the project prefix.
  statement {
    sid    = "ManageApigwCloudwatchRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:TagRole",
      "iam:ListRoleTags", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:ListAttachedRolePolicies", "iam:ListRolePolicies",
    ]
    resources = [local.apigw_cloudwatch_role_arn]
  }

  statement {
    sid       = "PassApigwCloudwatchRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.apigw_cloudwatch_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["apigateway.amazonaws.com"]
    }
  }

  # logs:DescribeLogGroups doesn't support resource-level permissions (it's an account-wide
  # list operation) — IAM silently denies it if the statement's Resource is anything but "*",
  # regardless of whether the action is also listed in a scoped statement above.
  statement {
    sid       = "ListLogGroupsForRefresh"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # API Gateway's IAM permission model is verb-based (apigateway:GET/POST/PUT/PATCH/DELETE
  # mapped onto opaque /restapis, /usageplans, /apikeys resource paths that don't carry an
  # account ID or name), not action-per-resource-type like the other statements here — so
  # unlike Lambda/IAM/logs above, this can't be scoped down to just this project's API by
  # resource ARN. This is the standard AWS-documented shape for granting API Gateway
  # management access, not an intentionally broad grant.
  statement {
    sid    = "ManageApiGateway"
    effect = "Allow"
    actions = [
      "apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE",
    ]
    resources = [
      "arn:aws:apigateway:*::/restapis",
      "arn:aws:apigateway:*::/restapis/*",
      "arn:aws:apigateway:*::/usageplans",
      "arn:aws:apigateway:*::/usageplans/*",
      "arn:aws:apigateway:*::/apikeys",
      "arn:aws:apigateway:*::/apikeys/*",
      "arn:aws:apigateway:*::/tags/*",
      "arn:aws:apigateway:*::/account",
    ]
  }

  statement {
    sid       = "ReadOwnIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  statement {
    sid    = "RefreshOwnCiInfra"
    effect = "Allow"
    actions = [
      "iam:GetOpenIDConnectProvider", "iam:ListOpenIDConnectProviderTags",
      "iam:GetRole", "iam:ListRoleTags", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies",
      "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions", "iam:ListPolicyTags",
    ]
    resources = [local.self_oidc_provider_arn, local.self_role_arn, local.self_policy_arn]
  }
}

resource "aws_iam_policy" "deploy_permissions" {
  name   = "${var.project_name}-github-actions-deploy-policy"
  policy = data.aws_iam_policy_document.deploy_permissions.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "deploy_permissions" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = aws_iam_policy.deploy_permissions.arn
}
