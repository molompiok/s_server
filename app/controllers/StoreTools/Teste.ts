import { Logs, waitHere } from "#controllers/Utils/functions";
import { execa } from "execa";

export {multipleTestDockerInstavecEnv, testDockerInstanceEnv}

async function testDockerInstanceEnv({ url, envMap }: { url: string, envMap: Record<string, string> }): Promise<Record<string, string> | undefined> {

  try {
    console.log(`🚀 TEST DE DOCKER INSTANCE a d'address : '${url}`)
    const { stdout, stderr } = await execa('curl', [url])

    if (stderr) {
      console.error(`❌ Error lors du teste`, stderr)
      return
    }
    console.log({ stdout, stderr });

    const dataEnv = JSON.parse(stdout);
    const badKeys = {} as any;
    Object.keys(dataEnv).forEach(k => {
      (dataEnv[k] != envMap[k])
        &&
        (
          badKeys[k] = {
            env: envMap[k],
            badEnv: dataEnv[k]
          }
        )
      console.log(`🔹 Test env => ${k}:${badKeys[k] || envMap[k]}`);
    }
    );
    return Object.keys(badKeys).length > 0 ? badKeys : undefined
  } catch (error) {
    console.error(`❌ Error env is not a json`, error.message)
    return { error: '' }
  }
}

async function multipleTestDockerInstavecEnv({ max_tentative, interval, url, envMap }: { max_tentative: number, interval: number, url: string, envMap: Record<string, string> }) {
  const logs = new Logs(multipleTestDockerInstavecEnv)
  let badKeys;
  for (let i = 0; i < parseInt(max_tentative.toString()); i++) {
    badKeys = await testDockerInstanceEnv({ url, envMap });
    logs.log(`🔹 Test de l'api ${url} : ${i + 1}`);
    if (badKeys) {
      await waitHere(parseInt(interval.toString()));
    } else {
      return logs.log(`✅ Le Nouveau store a passe les test a l'url${url}`).asOk()
    }

  }
  return logs.asNotOk()
}
