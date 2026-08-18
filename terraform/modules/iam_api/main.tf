# Read-only execution role for the API's serving Lambda. Deliberately narrower than
# eduverify's own ingestion Lambda role (terraform/modules/iam in the eduverify repo, which
# needs write access) — this repo never writes to the table, so it never gets write actions.

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda_exec" {
  statement {
    sid       = "ReadInstitutionRecords"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:BatchGetItem"]
    resources = [var.dynamodb_table_arn]
  }

  statement {
    sid       = "QueryInstitutionsByStatus"
    effect    = "Allow"
    actions   = ["dynamodb:Query"]
    resources = [var.dynamodb_gsi_arn]
  }

  statement {
    sid    = "WriteLambdaLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:log-group:${var.log_group_name}:*"]
  }
}

resource "aws_iam_policy" "lambda_exec" {
  name   = "${var.role_name}-policy"
  policy = data.aws_iam_policy_document.lambda_exec.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_exec" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_exec.arn
}
