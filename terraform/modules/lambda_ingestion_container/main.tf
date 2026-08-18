# Container-image Lambda for the ingestion handler — chosen over the zip+layer approach the
# legacy eduverify/terraform/modules/lambda uses (see ../../../ingestion/Dockerfile's header
# comment for why). This module only creates the ECR repository and the Lambda function that
# points at an image in it; it does NOT build or push the image — that's a CI/manual step
# outside Terraform, using this module's `ecr_repository_url` output as the push target.
#
# Bootstrap order (chicken-and-egg, same shape as this repo's api_key_tiers_json bootstrap —
# see ../../CLAUDE.md): the Lambda function can't be created until an image exists at
# `image_uri`, but the ECR repo it gets pushed to is itself created by this module. So:
#   1. `terraform apply -target=aws_ecr_repository.ingestion` to create just the repo.
#   2. Build and push an image to it (see ../../../ingestion/Dockerfile).
#   3. `terraform apply` for real, with `image_uri` pointing at the pushed tag.

resource "aws_ecr_repository" "ingestion" {
  name                 = var.function_name
  image_tag_mutability = "MUTABLE"
  tags                 = var.tags

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "ingestion" {
  repository = aws_ecr_repository.ingestion.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = var.log_group_name
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "ingestion" {
  function_name = var.function_name
  role          = var.role_arn
  package_type  = "Image"
  image_uri     = var.image_uri
  architectures = [var.architecture]
  timeout       = var.timeout
  memory_size   = var.memory_size

  environment {
    variables = var.environment_variables
  }

  tags = var.tags

  depends_on = [aws_cloudwatch_log_group.lambda]
}
