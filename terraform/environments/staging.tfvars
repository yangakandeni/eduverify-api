environment  = "staging"
project_name = "eduverify-api-staging"
stage_name   = "staging"

# The table eduverify/terraform/data-stack created and seeded in THIS account — same
# account as this Lambda deploys into, so no cross-account IAM is needed.
dynamodb_table_name = "eduverify-api-staging-institutions"
dynamodb_table_arn  = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions"
dynamodb_gsi_arn    = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions/index/GSI1"

api_keys = [
  { name = "eduverify-internal-staging", tier = "internal" }
]

log_retention_days = 7
