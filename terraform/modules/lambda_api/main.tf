# Packages the esbuild-bundled dist/ directory (built by `npm run build` in the repo root —
# see package.json) as a single-file CJS Lambda, unlike eduverify's Python ingestion Lambda
# which ships source + a separate dependency layer. One self-contained bundle means no layer
# to manage here.

data "archive_file" "source" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.module}/build/source.zip"

  lifecycle {
    precondition {
      condition     = length(fileset(var.source_dir, "*")) > 0
      error_message = "Lambda build directory (${var.source_dir}) is empty or missing. Run `npm run build` in the repo root before terraform plan/apply."
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "api" {
  function_name    = var.function_name
  role             = var.role_arn
  handler          = "index.handler"
  runtime          = var.runtime
  architectures    = [var.architecture]
  filename         = data.archive_file.source.output_path
  source_code_hash = data.archive_file.source.output_base64sha256
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = var.environment_variables
  }

  tags = var.tags

  depends_on = [aws_cloudwatch_log_group.lambda]
}
