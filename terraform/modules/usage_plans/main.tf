# v1 has no self-serve signup — keys are issued manually (per the plan's confirmed decision).
# This module creates the actual API Gateway keys from a plain list of {name, tier} and
# associates them with one usage plan (quota/throttle enforced natively by API Gateway).
# Tier-specific *feature* gating (e.g. "free tier gets no /batch access") is NOT expressed
# here — that's src/tiers.ts's job at the application layer, driven by the
# EDUVERIFY_API_KEY_TIERS env var, which has to be wired up as a second step after this
# module creates the keys (see the module's own README note on the apply-order chicken-and-egg
# this deliberately avoids).

resource "aws_api_gateway_usage_plan" "plan" {
  name = "${var.name_prefix}-usage-plan"

  api_stages {
    api_id = var.api_id
    stage  = var.stage_name
  }

  quota_settings {
    limit  = var.quota_limit
    period = "MONTH"
  }

  throttle_settings {
    rate_limit  = var.rate_limit
    burst_limit = var.burst_limit
  }

  tags = var.tags
}

resource "aws_api_gateway_api_key" "keys" {
  for_each = { for k in var.api_keys : k.name => k }

  name = each.value.name
  tags = merge(var.tags, { Tier = each.value.tier })
}

resource "aws_api_gateway_usage_plan_key" "keys" {
  for_each = aws_api_gateway_api_key.keys

  key_id        = each.value.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.plan.id
}
