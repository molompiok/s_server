#Install Volta
curl https://get.volta.sh | bash

#Install Node version
volta install node@22.14.0

#Install pnpm
npm i -g pnpm

#Update apt
sudo apt update

#Install Nginx
sudo apt install nginx
#Test Nginx
curl 127.0.0.1:80

#Install Docker
# Add Docker's official GPG key:
#sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
#Test docker
sudo docker run hello-world

#Install Redis
sudo apt-get install lsb-release curl gpg
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
sudo chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis
#Enable Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server


#Install PsotgreSQL
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo apt update
sudo apt install -y postgresql
#en cas de probleme 
sudo rm -f /etc/apt/sources.list.d/pgdg.list
### puis 
sudo apt install -y postgresql






#####################
	Adonis
####################
pnpm create adonisjs@latest

#####################
	Vps Config
####################

which nginx #pour connaitre l'emplacement de programme
sudo adduser --system --group adonis_runner
sudo usermod -aG docker,sudo adonis_runner
sudo visudo
#ajouter a la fini du ficher 
adonis_runner ALL=(ALL) NOPASSWD: ALL


#########################
   Developement config
#########################
#Add local domain name
sudo nano /etc/hosts
#Les ip ici font reference au ip disponible sur le pc
#on ne rajoute pas de port
127.0.0.1       sublymus_server.local
127.0.0.1       mon-site.local
127.0.0.1       sublymus_server.com
#test du site local // doit repondre si le port 3333 est servis
curl sublymus_server.com:3333 # => 127.0.0.1:3333

#Rendre le site local dispo sur le port 80
sudo nano /etc/nginx/sites-available/sublymus_server.com
#Ajout
 server {
    listen 80; #le port 80
    server_name sublymus_server.com;

    location / { # sublymus_server.com:80 => http://127.0.0.1:3333
        proxy_pass http://127.0.0.1:3333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /use_path { 
        # sublymus_server.com:80/use_path => http://127.0.0.1:4444/use_path
        # Sans le / a la fin de l'address => nginx ajoute (le chemain)use_path a la suite => http://127.0.0.1:4444/use_path; 
        proxy_pass http://127.0.0.1:4444; 
        #etc..
    }
    location /balo { 
        # sublymus_server.com:80/balo => http://127.0.0.1:4444/balo
        # Avec le / a la fin de l'address => nginx n'ajoute pas (le chemain)use_path a la suite => http://127.0.0.1:4444/; 
        # on peut aussi specifier la redirection =>  http://127.0.0.1:4444/redirection
        proxy_pass http://127.0.0.1:4444/;
        #etc..
    }
    access_log /var/log/nginx/mon-site.local_access.log;
    error_log /var/log/nginx/mon-site.local_error.log;
}
#Tester
sudo ln -s /etc/nginx/sites-available/sublymus_server.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
curl sublymus_server.com           # http://127.0.0.1:3333
curl sublymus_server.com/user_path # http://127.0.0.1:4444/use_path
curl sublymus_server.com/balo      #  http://127.0.0.1:444/


# Ajout de plusieurs domaines local independant dans nginx
sudo nano /etc/nginx/sites-available/mon-domaine.domaine
#add pour chaque domaine un file mon-domaine.domaine
server {
    listen 80;
    server_name mon-domaine.domaine;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}