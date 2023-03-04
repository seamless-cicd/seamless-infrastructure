# If no source code is present, exit
if ! [ -d "/data/app" ]; then
    echo "Source code has not been cloned yet"
    exit 1
fi

# Check if Dockerfile exists
DOCKERFILE_FILE_LOCATION="/data/app/$DOCKERFILE_PATH/Dockerfile"

if ! [ -f $DOCKERFILE_FILE_LOCATION ]; then
    echo "Error: Dockerfile not found at $DOCKERFILE_FILE_LOCATION"
    exit 1
fi

# Build the Docker image and tag it with the ECR repository name
echo "Building Docker image"

docker build -t $AWS_ECR_REPO /data/app/$DOCKERFILE_PATH

# Check if the build succeeded
if [ $? -eq 0 ]; then
    echo "Docker build succeeded"
else
    echo "Error: Docker build failed"
    exit 1
fi

# Login to AWS
echo "Logging into AWS"

LOGIN_PASSWORD="$(aws ecr get-login-password --region $AWS_DEFAULT_REGION)"
if [ $? -ne 0 ]; then
    echo "Error: failed to get ECR login password"
    exit 1
fi

echo "$LOGIN_PASSWORD" | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

# Check if the ECR repository exists
aws ecr describe-repositories --repository-names $AWS_ECR_REPO > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "ECR repository '$AWS_ECR_REPO' already exists"
else
    # Create a new repository
    echo "ECR repository '$AWS_ECR_REPO' doesn't exist; creating it now"
    aws ecr create-repository --repository-name $AWS_ECR_REPO
fi

# Tag image
FULL_ECR_TAG="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$AWS_ECR_REPO:latest"
docker tag $AWS_ECR_REPO:latest $FULL_ECR_TAG

# Push image
echo "Pushing image $AWS_ECR_REPO to ECR, for AWS account $AWS_ACCOUNT_ID"
docker push $FULL_ECR_TAG

if [ $? -eq 0 ]; then
    echo "Push succeeded"
else
    echo "Push failed"
    exit 1
fi