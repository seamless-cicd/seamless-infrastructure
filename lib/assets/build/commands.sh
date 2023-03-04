# Build Image
echo "building and pushing to $AWS_ECR_REPO for AWS account $AWS_ACCOUNT_ID"
cd /data/app

docker build -t $ECR_REPO .

# Login to AWS
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

# Create ECR repo if it doesn't exist
aws ecr describe-repositories --repository-names $AWS_ECR_REPO || aws ecr create-repository --repository-name $AWS_ECR_REPO

# Tag image
docker tag $AWS_ECR_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/$AWS_ECR_REPO:latest

# Push image
docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/$AWS_ECR_REPO:latest