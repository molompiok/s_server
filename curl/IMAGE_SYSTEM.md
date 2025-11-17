# Système de gestion des images - Documentation

## Comment ça fonctionne

### 1. Format des noms de fichiers

Le système `createFiles` cherche les fichiers avec le pattern :
```
${column_name}_${count}
```
où `count` commence à 0 et s'incrémente jusqu'à ce qu'aucun fichier ne soit trouvé.

**Exemples :**
- Pour `logo` : `logo_0`, `logo_1`, `logo_2`, etc.
- Pour `cover_image` : `cover_image_0`, `cover_image_1`, etc.
- Pour `preview_images` : `preview_images_0`, `preview_images_1`, etc.

### 2. Utilisation dans curl

```bash
curl -F "logo_0=@test_image.png" \
     -F "cover_image_0=@test_image.png" \
     -F "preview_images_0=@test_image.png"
```

### 3. Traitement des images

1. **Récupération** : `request.file("${column_name}_${count}")`
2. **Validation** :
   - `min` : nombre minimum de fichiers requis
   - `max` : nombre maximum de fichiers
   - `extname` : extensions autorisées (png, jpg, jpeg, webp, etc.)
   - `maxSize` : taille maximale (en bytes)
   - `throwError` : si true, lance une erreur si validation échoue

3. **Compression** :
   - Si `compress: 'img'` : conversion en WebP avec Sharp (qualité 90)
   - Si `compress: 'none'` : fichier déplacé tel quel
   - Les fichiers sont sauvegardés dans `FILE_STORAGE_PATH`

4. **Retour** : Tableau d'URLs des fichiers sauvegardés

### 4. Configuration pour les Stores

```typescript
// Logo (requis)
createFiles({
  column_name: "logo",
  options: { 
    compress: 'img', 
    min: 1, 
    max: 1, 
    maxSize: 12 * MEGA_OCTET, 
    extname: EXT_IMAGE, 
    throwError: true 
  }
})

// Cover image (requis)
createFiles({
  column_name: "cover_image",
  options: { 
    compress: 'img', 
    min: 1, 
    max: 1, 
    maxSize: 12 * MEGA_OCTET, 
    extname: EXT_IMAGE, 
    throwError: true 
  }
})

// Favicon (optionnel)
createFiles({
  column_name: "favicon",
  options: { 
    compress: 'img', 
    min: 0, 
    max: 1, 
    maxSize: 12 * MEGA_OCTET, 
    extname: EXT_IMAGE, 
    throwError: true 
  }
})
```

### 5. Configuration pour les Thèmes

```typescript
// Preview images (requis, min 1, max 7)
createFiles({
  column_name: "preview_images",
  options: {
    compress: 'img',
    min: 1,
    max: 7,
    maxSize: 12 * MEGA_OCTET,
    extname: EXT_IMAGE,
    throwError: true
  }
})
```

### 6. Extensions autorisées

Définies dans `EXT_IMAGE` :
```typescript
['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'avif', 'apng', 'gif', 'png', 'webp']
```

### 7. Notes importantes

- Les images sont converties en **WebP** si `compress: 'img'`
- Sharp doit pouvoir lire le format source (PNG, JPG, etc.)
- L'image doit être valide et lisible par Sharp
- Les fichiers temporaires sont dans le dossier système tmp, puis déplacés vers `FILE_STORAGE_PATH`

