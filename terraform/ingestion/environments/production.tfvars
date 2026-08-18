# Deploys into the eduverify-api-prod AWS account (924285051814) — mirrors staging.tfvars
# exactly, different account/names. See staging.tfvars's comment for the apply sequence and
# why ingestion_image_uri isn't set here.

environment          = "production"
project_name         = "eduverify-api-prod"
dynamodb_table_name  = "eduverify-api-prod-institutions"
s3_bucket_name       = "eduverify-api-prod-registers"
tf_state_bucket_name = "eduverify-api-prod-tfstate-924285051814"
log_retention_days   = 30
