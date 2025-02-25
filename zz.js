'${store_id}_docker_instance'



/*  
//////create store
curl -X POST 'http://localhost:3333/create_store' -H 'Authorization: Bearer oat_Ng.eUtqVWxMWTc3WEJqZHNlWlF4U2JFa2k1VEdQMDVQZHRHRFFyMkp4MDI2OTY3NTUxNjE' -d '{  "name":"41_ladona",  "description":"description_ladona",  "user_id":"aee75199-35a6-430f-b3a8-cbed01f48c87" }'

//////create store
curl --location 'http://localhost:3333/create_store'
--header 'Authorization: Bearer oat_Ng.eUtqVWxMWTc3WEJqZHNlWlF4U2JFa2k1VEdQMDVQZHRHRFFyMkp4MDI2OTY3NTUxNjE'
--data '{
    "name":"41_ladona",
    "description":"description_ladona",
    "user_id":"aee75199-35a6-430f-b3a8-cbed01f48c87"
}'

//////create store
curl --location 'http://localhost:3333/update_store'
--header 'Authorization: Bearer oat_Ng.eUtqVWxMWTc3WEJqZHNlWlF4U2JFa2k1VEdQMDVQZHRHRFFyMkp4MDI2OTY3NTUxNjE'
--data '{
    "name":"41_ladona",
    "description":"description_ladona",
    "user_id":"aee75199-35a6-430f-b3a8-cbed01f48c87"
}'

//////create store
curl --location 'http://localhost:3333/delete_store/7377f5de-0fc5-40d1-bd42-7022cec97c56'
--header 'Authorization: Bearer oat_Ng.eUtqVWxMWTc3WEJqZHNlWlF4U2JFa2k1VEdQMDVQZHRHRFFyMkp4MDI2OTY3NTUxNjE'
--data '{}'

*/

/* login
curl --location 'http://localhost:3333/login' \
--header 'Content-Type: application/json' \
--data-raw '{
    "email":"sublymus@gmail.com",
    "password":"lol"
}'

127.0.0.1       sublymus_server.com  
127.0.0.1       balo.local
127.0.0.1       ladona.io 
127.0.0.1       moni.sublymus_server.ru   
127.0.0.1       minova.lili   
127.0.0.1       baltazard          
127.0.0.1       messah.xxl           
127.0.0.1       dorkounou.ghana
127.0.0.1       by.ng   
*

sudo docker rm -f $(sudo docker ps -qa)

sudo docker run -d -it -u '1018:1018' --name container_4016 -p '4016:3334' -v '/volumes/api/99787e46:/volumes' -e 'STORE_ID=99787e46-8fda-4fb9-94ef-eef401146569' -e 'BASE_ID=99787e46' -e 'OWNER_ID=aee75199-35a6-430f-b3a8-cbed01f48c87' -e 'TZ=UTC' -e 'HOST=0.0.0.0' -e 'LOG_LEVEL=info' -e 'APP_KEY=4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk' -e 'NODE_ENV=production' -e 'DB_USER=u_99787e46' -e 'DB_HOST=127.0.0.1' -e 'DB_PORT=5432' -e 'DB_PASSWORD=w_99787e46' -e 'DB_DATABASE=db_99787e46' -e 'REDIS_HOST=127.0.0.1' -e 'REDIS_PORT=6379' -e 'REDIS_PASSWORD=redis_w' -e 'PORT=3334' -e 'EXTERNAL_PORT=4008' -e 'USER_NAME=u_99787e46' -e 'DOCKER_IMAGE=s_api:v1.0.4' -e 'VOLUME_TARGET=/volumes' -e 'VOLUME_SOURCE=/volumes/api/99787e46' -e 'CONTAINER_NAME=container_99787e46'  -e 'THEME_ID=THEME_ID' -e 'STORE_NAME=STORE_NAME' -e 'USER_ID=1018' 's_api:v1.0.4'






*/