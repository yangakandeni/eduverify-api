# Partial backend configuration for production. Used via:
#   AWS_PROFILE=eduverify-api-prod terraform init -backend-config=environments/production.backend.hcl
#
# Reuses the SAME bucket/lock table that eduverify/terraform/data-stack's backend_state.tf
# bootstrapped in this account (eduverify-api-prod-tfstate-924285051814 /
# eduverify-api-prod-tf-locks) — different `key` from that stack's own state.

bucket         = "eduverify-api-prod-tfstate-924285051814"
key            = "eduverify-api/production/terraform.tfstate"
region         = "af-south-1"
dynamodb_table = "eduverify-api-prod-tf-locks"
encrypt        = true
