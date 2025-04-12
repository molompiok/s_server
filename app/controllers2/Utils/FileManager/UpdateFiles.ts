
import fs from "fs";
import { moveFile } from "./CreateFiles.js";
import { HttpContext } from "@adonisjs/core/http";
import env from "#start/env";

type OptionsType = {
  maxSize?: number;
  min?: number;
  max?: number;
  extname?: string[];
  compress?:'none' | 'img' | 'zip';
  throwError?: boolean;
};

export async function updateFiles({
  request,
  table_id,
  table_name,
  column_name,
  options,
  distinct,
  lastUrls,
  newPseudoUrls,
}: {
  lastUrls: string  ;
  newPseudoUrls: string | undefined;
  request: HttpContext["request"];
  table_id: string;
  table_name: string;
  distinct?:string,
  column_name: string;
  options?: OptionsType;
}): Promise<string[]> {
  let _newPseudoUrls: string[] = [];
  let _lastUrls: string[] = [];
  const { extname, max, maxSize, min, compress,throwError } = options || {};

  try {
    _lastUrls = JSON.parse(lastUrls);
    if (!Array.isArray(_lastUrls)) _lastUrls = [];
  } catch (error) {}
  try {
    console.log({ newPseudoUrls });
    if (newPseudoUrls) {
      _newPseudoUrls = JSON.parse(newPseudoUrls);
    }
    if (!Array.isArray(_newPseudoUrls)) _newPseudoUrls = [];
  } catch (error) {}

  const pointer = (distinct?(distinct+':'):'')+column_name + "_";
  let fileLength = 0;

  const promisesAdd = _newPseudoUrls.map((pseudoUrl, i) => {
    try {
      if (pseudoUrl.startsWith(pointer)) {
        const file = request.file(pseudoUrl);
        if (!file) return Promise.reject(null);
        if (extname && !extname.includes(file.extname || "")) {
          if (throwError)
            throw new Error("File bad Extension : " + file?.extname);
          else return Promise.reject(null);
        }
        
        if (maxSize && file.size > maxSize) {
          if (throwError)
            throw new Error("File  size must be < " + file.size + " byte");
          else return Promise.reject(null);
        }
        fileLength++;

        return moveFile({ file, column_name, count: i, table_id, table_name ,compress });
      } else {
        const fileStorageUrl = env.get("FILE_STORAGE_URL") || '';
        const filePath = `${env.get("FILE_STORAGE_PATH")}${pseudoUrl.replace(fileStorageUrl, '')}`;
        const fileUrl = `${pseudoUrl}`;
        
        if (fs.existsSync(filePath)) {
          fileLength++;
          return Promise.resolve(fileUrl);
        } else return Promise.resolve(null);
      }
    } catch (error) {
      return Promise.resolve(null);
    }
  });

  let newUrls: string[] = [];
  if (min && fileLength < min) {
    if (throwError) throw new Error("number of Files must be >= " + min);
    else return [];
  }
  if (max && fileLength > max) {
    if (throwError) throw new Error("number of Files must be <= " + min);
    else return [];
  }

  newUrls = (await Promise.allSettled(promisesAdd))
    .filter((f) => f.status === "fulfilled" && (f as any).value != null)
    .map((m) => (m as any).value);

  _lastUrls.forEach((lastUrl) => {
    if (!newUrls.includes(lastUrl)) {
      if(!lastUrl.includes(table_id)) return
      const filePath = `.${lastUrl}`;
      
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, function (err) {
          if (err) return console.log(err);
        });
      }else{
        console.log('ERROR file don\'t exist');
      }
    }
  });

  console.log("### _lastUrls ", _lastUrls);
  console.log("### newUrls ", newUrls);

  return newUrls;
}
