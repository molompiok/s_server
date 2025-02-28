'${store_id}_docker_instance'



/*  
//////create store
curl -X POST 'http://localhost:3333/create_store' -H 'Content-Type: application/json' -H 'Authorization: oat_MQ.dEJRVlZ4R0Yzb0FaNnY5eEtiZHBBaUEtbmlmeVo3amdlZTh5WGE2SjI4NDA0MDkxNTY' -d '{  "name":"ladona_5",  "description":"description_ladona",  "user_id":"d3d8dfcf-b84b-49ed-976d-9889e79e6306" }'

//////create store
curl -X POST --location 'http://localhost:3333/create_store'\
--header 'Authorization: Bearer oat_MQ.Z0RnYU1yX1N1eEwxV2dWVGVxckxmWXFwNzlGbnJZM2EtS1k5enlEWjI0MTgwODI1MjQ'\
--data '{\
    "name":"41_ladona",\
    "description":"description_ladona",\
    "user_id":"f6030064-78d9-41d6-a3c0-1e3e484f73f6"\
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

/* register
curl --location 'http://localhost:3333/register' \
--header 'Content-Type: application/json' \
--data-raw '{
    "full_name":"sublymus",
    "email":"sublymus@gmail.com",
    "password":"lol"
}'

127.0.0.1       sublymus_server.com

127.0.0.1       ladona_1.com
127.0.0.1       ladona_2.com
127.0.0.1       ladona_3.com
127.0.0.1       ladona_4.com
127.0.0.1       ladona_5.com
127.0.0.1       ladona_6.com
127.0.0.1       ladona_7.com
127.0.0.1       ladona_8.com
127.0.0.1       ladona_9.com
127.0.0.1       ladona_10.com
127.0.0.1       ladona_11.com
127.0.0.1       ladona_12.com
127.0.0.1       ladona_13.com
127.0.0.1       ladona_14.com
127.0.0.1       ladona_15.com
127.0.0.1       ladona_16.com
127.0.0.1       ladona_17.com
127.0.0.1       ladona_18.com
127.0.0.1       ladona_19.com
127.0.0.1       ladona_20.com
127.0.0.1       ladona_21.com
127.0.0.1       ladona_22.com
127.0.0.1       ladona_23.com
127.0.0.1       ladona_24.com
127.0.0.1       ladona_25.com

sudo docker rm -f $(sudo docker ps -qa)

sudo docker run -d -it -u '1018:1018' --name container_4016 -p '4016:3334' -v '/volumes/api/99787e46:/volumes' -e 'STORE_ID=99787e46-8fda-4fb9-94ef-eef401146569' -e 'BASE_ID=99787e46' -e 'OWNER_ID=aee75199-35a6-430f-b3a8-cbed01f48c87' -e 'TZ=UTC' -e 'HOST=0.0.0.0' -e 'LOG_LEVEL=info' -e 'APP_KEY=4IihbmaY6Fnj2Kf1uXSwWoAc3qA0jlFk' -e 'NODE_ENV=production' -e 'DB_USER=u_99787e46' -e 'DB_HOST=127.0.0.1' -e 'DB_PORT=5432' -e 'DB_PASSWORD=w_99787e46' -e 'DB_DATABASE=db_99787e46' -e 'REDIS_HOST=127.0.0.1' -e 'REDIS_PORT=6379' -e 'REDIS_PASSWORD=redis_w' -e 'PORT=3334' -e 'EXTERNAL_PORT=4008' -e 'USER_NAME=u_99787e46' -e 'DOCKER_IMAGE=s_api:v1.0.4' -e 'VOLUME_TARGET=/volumes' -e 'VOLUME_SOURCE=/volumes/api/99787e46' -e 'CONTAINER_NAME=container_99787e46'  -e 'THEME_ID=THEME_ID' -e 'STORE_NAME=STORE_NAME' -e 'USER_ID=1018' 's_api:v1.0.4'






*/