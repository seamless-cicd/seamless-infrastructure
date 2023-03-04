#!/bin/bash -xe
echo "Updating libraries"
sudo yum update -
sudo yum install -y git

echo "Installing Docker"
sudo amazon-linux-extras install docker -y
sudo service docker start
sudo usermod -a -G docker ec2-user

echo "Installing Docker Compose"
sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose