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
    sid       = "ReadRawRegisters"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${var.s3_bucket_arn}/${var.s3_raw_prefix}*"]
  }

  statement {
    sid       = "WriteBackupDumps"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${var.s3_bucket_arn}/${var.s3_backup_prefix}*"]
  }

  statement {
    sid    = "WriteInstitutionRecords"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
      "dynamodb:BatchWriteItem",
    ]
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
