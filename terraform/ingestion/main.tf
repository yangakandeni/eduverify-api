# Ingestion + data stack — S3 (raw PDFs/backups), DynamoDB (institutions table), and the
# ingestion Lambda (container image, see ../../ingestion/Dockerfile), deployed into the SAME
# eduverify-api-* account this repo's serving stack (../main.tf) already reads from.
#
# This root supersedes eduverify/terraform/data-stack — that repo's copy provisioned this
# same live infrastructure as a stepping-stone stack, reusing its own ../modules/{s3,dynamodb,
# iam,lambda}. This root's environments/*.backend.hcl point at the EXACT SAME state bucket/key
# data-stack used, so `terraform init` here reattaches to the existing live state with zero
# resource recreation — verify with a truly empty `terraform plan` before ever applying from
# here, and before removing eduverify/terraform/data-stack.
#
# Deliberately a separate root from ../main.tf (the serving stack), not one combined root —
# mirrors the eduverify repo's own main.tf/data-stack split, and keeps this stack's deploy
# (infrequent, PDF-triggered) independent of the serving Lambda's (frequent, code-driven).

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

locals {
  lambda_function_name = "${var.project_name}-ingestion"
  log_group_name       = "/aws/lambda/${local.lambda_function_name}"

  common_tags = {
    Project     = "EduVerify-API"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Stack       = "ingestion"
  }
}

module "dynamodb" {
  source = "../modules/dynamodb"

  table_name = var.dynamodb_table_name
  tags       = local.common_tags
}

module "s3" {
  source = "../modules/s3"

  bucket_name = var.s3_bucket_name
  tags        = local.common_tags
}

module "iam_ingestion" {
  source = "../modules/iam_ingestion"

  role_name          = "${var.project_name}-lambda-exec-role"
  s3_bucket_arn      = module.s3.bucket_arn
  dynamodb_table_arn = module.dynamodb.table_arn
  dynamodb_gsi_arn   = module.dynamodb.gsi1_arn
  log_group_name     = local.log_group_name
  tags               = local.common_tags
}

module "lambda_ingestion_container" {
  source = "../modules/lambda_ingestion_container"

  function_name      = local.lambda_function_name
  role_arn           = module.iam_ingestion.role_arn
  image_uri          = var.ingestion_image_uri
  architecture       = var.lambda_architecture
  memory_size        = var.lambda_memory_size
  timeout            = var.lambda_timeout
  log_group_name     = local.log_group_name
  log_retention_days = var.log_retention_days
  tags               = local.common_tags

  environment_variables = {
    DYNAMODB_TABLE = module.dynamodb.table_name
    BACKUP_PREFIX  = "backups/"
  }
}

resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowExecutionFromS3"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_ingestion_container.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = module.s3.bucket_arn
}

resource "aws_s3_bucket_notification" "raw_register_upload" {
  bucket = module.s3.bucket_id

  lambda_function {
    lambda_function_arn = module.lambda_ingestion_container.function_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "raw/"
    filter_suffix       = ".pdf"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke]
}
