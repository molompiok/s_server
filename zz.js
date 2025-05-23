/*  
//////create store
curl -X POST 'http://localhost:3333/create_store' -H 'Content-Type: application/json' -H 'Authorization: oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{  "name":"ladona_1",  "description":"description_ladona",  "user_id":"d3d8dfcf-b84b-49ed-976d-9889e79e6306" }'

/* get_stores
curl --location 'http://localhost:3333/get_stores' 

// update_store
curl -X PUT 'http://localhost:3333/update_store' -H 'Content-Type: application/json' -H 'Authorization: Bearer oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{"store_id":"0a6598dc-fd6b-40cc-916f-656b0aa0bdaa","name":"ladona_10"}'

// add_store_domaine
curl -X POST 'http://localhost:3333/add_store_domaine' -H 'Content-Type: application/json' -H 'Authorization: Bearer oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{"store_id":"0a6598dc-fd6b-40cc-916f-656b0aa0bdaa","domaine":"qwerty2.com"}'

// remove_store_domaine
curl -X POST 'http://localhost:3333/remove_store_domaine' -H 'Content-Type: application/json' -H 'Authorization: Bearer oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{"store_id":"0a6598dc-fd6b-40cc-916f-656b0aa0bdaa","domaine":"qwerty2.com"}'


///// stop_store
curl  -X PUT 'http://localhost:3333/stop_store/0a6598dc-fd6b-40cc-916f-656b0aa0bdaa' -H 'Authorization: Bearer oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{}'

///// restart_store
curl  -X PUT 'http://localhost:3333/restart_store/0a6598dc-fd6b-40cc-916f-656b0aa0bdaa' -H 'Authorization: Bearer oat_Mw.MGFDT2xubF9qblo2X2dMMmRlbExGNk9RTXpSMU9Ddld1ODBlbktZNDkwOTQzMzgzNQ' -d '{}'

/// login
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

127.0.0.1       sublymus-server.com

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

ip addr show eth0 | grep 'inet ' | awk '{print $2}' | cut -d'/' -f1


hello-world:latest
http://ladona/
http://sublymus-server.com/ladona/
*/

