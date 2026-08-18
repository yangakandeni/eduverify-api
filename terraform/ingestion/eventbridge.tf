# Mirrors eduverify/terraform/data-stack/eventbridge.tf. Currently a no-op, for the same
# reason: lambda_handler.handler only understands the S3-trigger event shape.

resource "aws_cloudwatch_event_rule" "weekly_pdf_scraper" {
  name                = "${var.project_name}-weekly-pdf-scraper"
  description         = "Triggers the ingestion Lambda on a schedule to fetch and parse the latest DHET register PDF."
  schedule_expression = var.scraper_schedule_expression
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "invoke_lambda" {
  rule      = aws_cloudwatch_event_rule.weekly_pdf_scraper.name
  target_id = "${var.project_name}-ingestion-lambda"
  arn       = module.lambda_ingestion_container.function_arn

  input = jsonencode({
    source = "aws.events"
    action = "scheduled_pdf_ingestion"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_invoke" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_ingestion_container.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_pdf_scraper.arn
}
