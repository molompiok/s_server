//@ts-nocheck
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import sharp from "sharp";
import fs from 'fs/promises'
type FileType = ReturnType<HttpContext["request"]["file"]>;
type OptionsType = {
  maxSize?: number;
  min?: number;
  max?: number;
  extname?: string[];
  compress?: 'none' | 'img' | 'zip';
  throwError?: boolean;
};

export async function createFiles({
  request,
  table_id,
  distinct,
  table_name,
  column_name,
  options,
}: {
  request: HttpContext["request"];
  table_id: string;
  table_name: string;
  distinct?:string,
  column_name: string;
  options?: OptionsType;
}): Promise<string[]> {
  let count = 0;
  const promises: Promise<any>[] = [];
  const filesList: FileType[] = [];
  const { extname, max, maxSize, min, throwError, compress } = options || {};
  while (true) {
    const file = request.file(`${distinct?distinct+':':''}${column_name}_${count++}`);
    if (!file) {
      break;
    }
    filesList.push(file);
  }
  if (min && filesList.length < min) {
    if (throwError) throw new Error(column_name+ " number of Files must be >= " + min);
    else return [];
  }
  if (max && filesList.length > max) {
    if (throwError) throw new Error(column_name+ " number of Files must be <= " + max);
    else return [];
  }

  filesList.forEach((file, i) => {
    if (!file) return;
    if (extname && !extname.includes(file.extname || "")) {
      if (throwError) throw new Error("File bad Extension : " + file?.extname);
      else return;
    }
    if (maxSize && file.size > maxSize) {
      if (throwError)
        throw new Error("File  size must be < " + file.size + " byte");
      else return;
    }

    promises.push(
      moveFile({
        column_name,
        compress,
        count: i,
        file,
        table_id,
        table_name,
      })
    );
  });

  await createDir(env.get("FILE_STORAGE_PATH") || "")

  return (await Promise.allSettled(promises))
    .filter((f) => f.status == "fulfilled")
    .map((m) => (m as any).value); //urls
}

async function createDir(dir: string) {
  try {
    await fs.stat(dir);
  } catch (error) {
    await fs.mkdir(dir);
  }
}

export function moveFile({
  column_name,
  file,
  table_id,
  compress,
  table_name,
  count,
}: {
  file: FileType;
  compress?: 'none' | 'img' | 'zip';
  table_id: string;
  table_name: string;
  column_name: string;
  count: number;
}) {
  if (!file) return Promise.reject(null);

  return new Promise(async (rev, rej) => {
    try {
      let fileName = ''
      let ext = file.clientName
      ext =compress && compress == 'img'?'webp': ext.lastIndexOf('.') + 1 < ext.length ? ext.substring(ext.lastIndexOf('.') + 1, ext?.length) : 'zip'
      fileName = `${Date.now().toString(32)}_${Math.round(
        Math.random() * 10e6
      ).toString(36)}${count}_${table_name}_${column_name}_${table_id}.${ext}`;

      const path = `${env.get("FILE_STORAGE_PATH")}/${fileName}`;
      const url = `${env.get("FILE_STORAGE_URL")}/${fileName}`;
      console.log({ path, url });

      if (compress && compress == 'img') {

        let sharpOBJ = sharp(file.tmpPath);

        // if (requiredResize) {
        //   sharpOBJ = sharpOBJ.resize(iw ? {
        //     width: iw,
        //     height: ih
        //   } : c)
        // }
        sharpOBJ = sharpOBJ.webp({ quality: 90 })
        // .composite([
        //   {
        //     input: "./logo_joumiadeals2.png",
        //     top: ih - lh,
        //     left: iw - lw,
        //   },
        // ])

        sharpOBJ.toFile(path, () => {
          rev(url)
        });
      } else if (!compress || compress == 'none') {
        await file.move(env.get("FILE_STORAGE_PATH") || "", {
          name: fileName,
          overwrite: true,
        });
        rev(url);
      } else if (compress && compress == 'zip') {
        throw new Error(' compress ==> ZIP      not implemented');
      }

    } catch (error) {
      console.log(error.message);

      rej(null);
    }
  });
}
