terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Values supplied via partial configuration — see environments/*.backend.hcl and
  # `terraform init -backend-config=environments/<env>.backend.hcl`. Deliberately reuses the
  # SAME S3 bucket + DynamoDB lock table that eduverify's own Terraform already provisioned in
  # this account (eduverify-staging-tfstate-755729228319 / eduverify-tf-locks), under a
  # different state `key` — this repo's state never needs to be provisioned or bootstrapped on
  # its own, and the two repos' states stay fully independent despite sharing a bucket.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

locals {
  common_tags = {
    Project     = "EduVerify-API"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

module "iam_api" {
  source = "./modules/iam_api"

  # Distinct from eduverify/terraform/data-stack's ingestion Lambda role, which computes the
  # same "${project_name}-lambda-exec-role" name from the same project_name in this same
  # account — collided under the unsuffixed name during the first apply attempt here.
  role_name = "${var.project_name}-serving-lambda-exec-role"
  dynamodb_table_arn = var.dynamodb_table_arn
  dynamodb_gsi_arn   = var.dynamodb_gsi_arn
  log_group_name     = "/aws/lambda/${var.project_name}"
  tags               = local.common_tags
}

module "lambda_api" {
  source = "./modules/lambda_api"

  function_name      = var.project_name
  role_arn           = module.iam_api.role_arn
  source_dir         = "${path.module}/../dist"
  runtime            = var.lambda_runtime
  architecture       = var.lambda_architecture
  memory_size        = var.lambda_memory_size
  timeout            = var.lambda_timeout
  log_retention_days = var.log_retention_days
  tags               = local.common_tags

  environment_variables = {
    EDUVERIFY_TABLE_NAME    = var.dynamodb_table_name
    EDUVERIFY_API_KEY_TIERS = var.api_key_tiers_json
  }
}

module "api_gateway" {
  source = "./modules/api_gateway"

  api_name             = var.project_name
  stage_name           = var.stage_name
  lambda_invoke_arn    = module.lambda_api.invoke_arn
  lambda_function_name = module.lambda_api.function_name
  tags                 = local.common_tags
}

module "usage_plans" {
  source = "./modules/usage_plans"

  name_prefix = var.project_name
  api_id      = module.api_gateway.api_id
  stage_name  = module.api_gateway.stage_name
  api_keys    = var.api_keys
  quota_limit = var.usage_plan_quota_limit
  rate_limit  = var.usage_plan_rate_limit
  burst_limit = var.usage_plan_burst_limit
  tags        = local.common_tags
}
