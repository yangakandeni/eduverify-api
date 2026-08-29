# REST API (not HTTP API) — aws_api_gateway_usage_plan/aws_api_gateway_api_key are REST-API-
# native constructs; an HTTP API would need a hand-rolled Lambda authorizer for tiering
# instead, which contradicts the "AWS-native, no custom billing code" v1 decision.
#
# One catch-all {proxy+} resource forwards everything under /v1/* to the single serving
# Lambda (src/router.ts does the actual path/method dispatch — matches the "one Lambda +
# internal router" decision) and requires an API key. /v1/health, /v1/docs and
# /v1/openapi.yaml are each carved out as their own resource specifically so they can skip the
# API key requirement — health is an uptime check meant to be pollable without provisioning a
# key first, and the Swagger UI docs (plus the spec it fetches) need to be publicly browsable
# so a prospective consumer can read them before they have a key to try requests with.
#
# CORS: browser callers (Swagger UI's "Try it out", or any JS client hosted on a different
# origin than this API) send a preflight OPTIONS request before any GET/POST that carries the
# X-Api-Key header. `proxy_any`'s api_key_required = true means that preflight would 403
# before ever reaching the Lambda if it went through the ANY method — preflight requests never
# carry the API key — so each resource gets its own OPTIONS method, keyless, answered directly
# by a MOCK integration instead of invoking the Lambda. The Lambda's own responses (including
# its 4xx/5xx bodies) carry Access-Control-Allow-Origin too (see src/router.ts's CORS_HEADERS),
# but errors API Gateway generates itself (missing/invalid API key, throttling) never reach the
# Lambda — the gateway_response resources below add that header to those too.

resource "aws_api_gateway_rest_api" "api" {
  name = var.api_name
  tags = var.tags
}

resource "aws_api_gateway_resource" "v1" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "v1"
}

resource "aws_api_gateway_resource" "health" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "health"
}

resource "aws_api_gateway_method" "health_get" {
  rest_api_id      = aws_api_gateway_rest_api.api.id
  resource_id      = aws_api_gateway_resource.health.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "health_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.health.id
  http_method             = aws_api_gateway_method.health_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

module "health_cors" {
  source          = "../cors_options"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.health.id
  allowed_methods = "GET,OPTIONS"
}

resource "aws_api_gateway_resource" "docs" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "docs"
}

resource "aws_api_gateway_method" "docs_get" {
  rest_api_id      = aws_api_gateway_rest_api.api.id
  resource_id      = aws_api_gateway_resource.docs.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "docs_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.docs.id
  http_method             = aws_api_gateway_method.docs_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

module "docs_cors" {
  source          = "../cors_options"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.docs.id
  allowed_methods = "GET,OPTIONS"
}

resource "aws_api_gateway_resource" "openapi_yaml" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "openapi.yaml"
}

resource "aws_api_gateway_method" "openapi_yaml_get" {
  rest_api_id      = aws_api_gateway_rest_api.api.id
  resource_id      = aws_api_gateway_resource.openapi_yaml.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "openapi_yaml_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.openapi_yaml.id
  http_method             = aws_api_gateway_method.openapi_yaml_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

module "openapi_yaml_cors" {
  source          = "../cors_options"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.openapi_yaml.id
  allowed_methods = "GET,OPTIONS"
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy_any" {
  rest_api_id      = aws_api_gateway_rest_api.api.id
  resource_id      = aws_api_gateway_resource.proxy.id
  http_method      = "ANY"
  authorization    = "NONE"
  api_key_required = true

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "proxy_any" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

module "proxy_cors" {
  source          = "../cors_options"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.proxy.id
  allowed_methods = "GET,POST,OPTIONS"
}

# API Gateway generates these itself (missing/invalid API key, throttling) without ever
# reaching the Lambda, so src/router.ts's own CORS headers never apply to them — added here
# instead so a browser can still read the error rather than reporting an opaque CORS failure.
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.health.id,
      aws_api_gateway_method.health_get.id,
      aws_api_gateway_integration.health_get.id,
      module.health_cors.method_id,
      module.health_cors.integration_id,
      module.health_cors.integration_response_id,
      aws_api_gateway_resource.docs.id,
      aws_api_gateway_method.docs_get.id,
      aws_api_gateway_integration.docs_get.id,
      module.docs_cors.method_id,
      module.docs_cors.integration_id,
      module.docs_cors.integration_response_id,
      aws_api_gateway_resource.openapi_yaml.id,
      aws_api_gateway_method.openapi_yaml_get.id,
      aws_api_gateway_integration.openapi_yaml_get.id,
      module.openapi_yaml_cors.method_id,
      module.openapi_yaml_cors.integration_id,
      module.openapi_yaml_cors.integration_response_id,
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy_any.id,
      aws_api_gateway_integration.proxy_any.id,
      module.proxy_cors.method_id,
      module.proxy_cors.integration_id,
      module.proxy_cors.integration_response_id,
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.health_get,
    aws_api_gateway_integration.docs_get,
    aws_api_gateway_integration.openapi_yaml_get,
    aws_api_gateway_integration.proxy_any,
    module.health_cors,
    module.docs_cors,
    module.openapi_yaml_cors,
    module.proxy_cors,
    aws_api_gateway_gateway_response.default_4xx,
    aws_api_gateway_gateway_response.default_5xx,
  ]
}

resource "aws_api_gateway_stage" "stage" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.api.id
  stage_name    = var.stage_name
  tags          = var.tags

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access_logs.arn
    format = jsonencode({
      requestId         = "$context.requestId"
      ip                = "$context.identity.sourceIp"
      apiKeyId          = "$context.identity.apiKeyId"
      requestTime       = "$context.requestTime"
      httpMethod        = "$context.httpMethod"
      resourcePath      = "$context.resourcePath"
      status            = "$context.status"
      protocol          = "$context.protocol"
      responseLength    = "$context.responseLength"
      integrationStatus = "$context.integration.status"
      integrationError  = "$context.integration.error"
      errorMessage      = "$context.error.message"
      errorResponseType = "$context.error.responseType"
    })
  }

  depends_on = [aws_api_gateway_account.this]
}

# Account-level CloudWatch role, required before API Gateway will write ANY access or
# execution logs — a singleton per AWS account/region. Nothing else in this account manages
# it yet (eduverify's own Terraform has no aws_api_gateway resources at all), so this is safe
# to own here.
resource "aws_iam_role" "apigw_cloudwatch" {
  name = "${var.api_name}-apigw-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "apigw_cloudwatch" {
  role       = aws_iam_role.apigw_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.apigw_cloudwatch.arn
}

resource "aws_cloudwatch_log_group" "access_logs" {
  name              = "/aws/apigateway/${var.api_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# INFO-level execution logging + metrics for every method on the stage. data_trace_enabled
# stays off by default (var.enable_data_trace) since it captures full request/response
# payloads, including header values like X-Api-Key, in CloudWatch Logs.
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = aws_api_gateway_stage.stage.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled    = true
    logging_level      = "INFO"
    data_trace_enabled = var.enable_data_trace
  }

  depends_on = [aws_api_gateway_account.this]
}
