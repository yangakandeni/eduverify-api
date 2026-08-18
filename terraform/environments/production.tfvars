environment  = "production"
project_name = "eduverify-api-prod"
stage_name   = "production"

# The table eduverify/terraform/data-stack created and seeded in THIS account.
dynamodb_table_name = "eduverify-api-prod-institutions"
dynamodb_table_arn  = "arn:aws:dynamodb:af-south-1:924285051814:table/eduverify-api-prod-institutions"
dynamodb_gsi_arn    = "arn:aws:dynamodb:af-south-1:924285051814:table/eduverify-api-prod-institutions/index/GSI1"

# First internal key: EduVerify's own server-to-server calls (Part 3's cutover target),
# unlimited/internal tier.
api_keys = [
  { name = "eduverify-internal-production", tier = "internal" }
]

log_retention_days = 30
