
#Update apt
sudo apt update

#Install Volta
curl https://get.volta.sh | bash

#Install Node version
volta install node@22.14.0

#Install pnpm
npm i -g pnpm

#Install Nginx
sudo apt install nginx
sudo systemctl status nginx
sudo systemctl enable nginx
sudo systemctl start nginx
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
# lancher/ relancer
 redis-server --daemonize yes # en arriere plan..


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
noga ALL=(ALL) NOPASSWD: ALL // accorder tout les droit a mon user courrant

sudo mkdir /volumes/
sudo mkdir /volumes/api  ## cree le repertoir des volume

sudo adduser server_user --disabled-password --gecos '""' # cree un user sans password

sudo -u postgres psql
postgres=# CREATE USER s_server WITH PASSWORD 's_server_w';
CREATE ROLE
postgres=# ALTER USER s_server WITH SUPERUSER;
ALTER ROLE
postgres=# CREATE DATABASE s_server_db OWNER s_server;
CREATE DATABASE
postgres=# GRANT ALL PRIVILEGES ON DATABASE s_server_db TO s_server;
GRANT
postgres=# \q

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


# Ajout de plusieurs domain_names local independant dans nginx
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

#LIST DE COMMANDES
#Docker
#NB: pour changer le nom d'un container il faut le supprimer -f; le relancer avec le nouveau nom 
#NB: on peut combiner plusieurs option pour combiner les effets sudo docker ps --filter "name=4d" -q 
sudo docker ps -a --filter "name=container_5456fffg" # include le name
sudo docker ps -qa # list des id, y compris les container stopper
sudo docker ps # les container en cours
sudo docker images # list des images
sudo docker images -q # list des id des images
sudo docker rm -f $(sudo docker ps -qa) # remove tout les container
sudo docker rmi $(sudo docker images -q) # remove tout les images
sudo docker exec -it container_5456fffg bash # entrer dans le container avec une commande exemple : bash ; ou encore bash -c "ls -l"
sudo docker start container_5456fffg # demarrer un container
sudo docker stop container_5456fffg # stopper un container
sudo docker restart container_5456fffg # restart un container
sudo docker logs container_5456fffg # voir les logs
sudo docker inspect container_5456fffg # voir les infos du container
sudo docker ps -a | grep "4d" # chercher un container



###  INSTRUCTION POUR BIEN  LANCER DOCKER SWARM
# recuperer l'ip externe
ifconfig ou ip a
# cree une image si necessaire 
sudo docker build -t s_theme:v1.0.0 .
# tester l'image
sudo docker run -d -p 3000:3000  s_theme:v1.0.0
sudo docker ps
sudo docker ps -a
# cree un network, sublymus_net utiliser par s_server .env  NETWORK = sublymus_net
sudo docker network create --driver overlay --attachable --subnet 10.10.0.0/16 sublymus_net
# initialiser swarm
sudo docker swarm init --advertise-addr <ip-externe-de-ton-hote>
# cree un service
sudo docker service create \
  --name theme_aef45991-fa82-48c3-b476-d2a88469b676 \
  --replicas 2 \
  --network sublymus_net \
  --publish 30007:3000 \
  --env THEME_ID=aef45991-fa82-48c3-b476-d2a88469b676 \
  --env THEME_NAME="Minimaliste Sombre (Privé)" \
  --env NODE_ENV=development \
  --env REDIS_HOST=127.0.0.1 \
  --env REDIS_PORT=6379 \
  --env REDIS_PASSWORD=redis_password \
  s_theme:v1.0.0
  # verifier
  sudo docker service ls
  sudo docker service scale theme_aef45991-fa82-48c3-b476-d2a88469b676=3


## System config avant test
sudo mkdir -p /volumes/api/
cd /volumes/api/
sudo chown -R opus-ub:opus-ub /volumes/api/
sudo chmod 775 /volumes/api/ 




# 1. Stopper tous les conteneurs
docker stop $(docker ps -aq)

# 2. Supprimer tous les conteneurs
docker rm $(docker ps -aq)

# 3. Supprimer tous les services (si Docker Swarm est activé)
docker service rm $(docker service ls -q)

# 4. Supprimer tous les volumes
docker volume rm $(docker volume ls -q)

# 5. Supprimer tous les réseaux personnalisés (hors bridge, host, none)
docker network rm $(docker network ls --filter "type=custom" -q)

# 6. Supprimer toutes les images (optionnel si tu veux vraiment reset)
docker rmi -f $(docker images -q)

# 7. Supprimer tous les build caches (si tu fais beaucoup de build)
docker builder prune -a -f

docker swarm leave --force
docker swarm init  # si tu veux réinitialiser proprement