# Lambda container image for the ingestion handler. Chosen over the zip+layer approach the
# legacy eduverify/parser/lambda_handler.py deploy uses, since this repo has no existing
# zip/layer-build tooling to extend and pdfplumber/pypdf's native deps package more simply
# into one image than a separately-built dependency layer.
FROM public.ecr.aws/lambda/python:3.12

COPY requirements-lambda.txt .
RUN pip install --no-cache-dir -r requirements-lambda.txt

COPY pdf_extract.py grouping.py extraction.py build.py models.py dynamo_item.py lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
