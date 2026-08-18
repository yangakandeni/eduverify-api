# Deploys into the eduverify-api-staging AWS account (228615802615) — the SAME account and
# SAME state (bucket+key below match eduverify/terraform/data-stack/environments/
# api-staging.backend.hcl exactly) that data-stack already manages. This root supersedes it;
# see ../main.tf's header comment for the safe-adoption sequence (empty-plan check first).
#
# Apply with:
#   aws sso login --profile eduverify-api-staging
#   AWS_PROFILE=eduverify-api-staging terraform init -backend-config=environments/staging.backend.hcl
#   AWS_PROFILE=eduverify-api-staging terraform plan -var-file=environments/staging.tfvars \
#     -var="ingestion_image_uri=<account>.dkr.ecr.af-south-1.amazonaws.com/eduverify-api-staging-ingestion:<tag>"
#
# ingestion_image_uri has no default (and isn't set here) — it names a specific pushed image
# tag, not a stable config value; supply it via -var/TF_VAR_ at apply time. First-ever apply of
# the Lambda itself needs the ECR repo created first (`-target=module.lambda_ingestion_container.
# aws_ecr_repository.ingestion`), then an image pushed to it, before a real image_uri exists to
# apply with — see modules/lambda_ingestion_container/main.tf's bootstrap-order comment.

environment          = "staging"
project_name         = "eduverify-api-staging"
dynamodb_table_name  = "eduverify-api-staging-institutions"
s3_bucket_name       = "eduverify-api-staging-registers"
tf_state_bucket_name = "eduverify-api-staging-tfstate-228615802615"
log_retention_days   = 7
