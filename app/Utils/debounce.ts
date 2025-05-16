
import { Logs } from '../Utils/functions.js'; // Assure-toi que l'import est correct// app/controllers2/Utils/functions.ts (ou ailleurs)

// État pour le throttle (juste besoin de savoir si on est en période d'attente)// app/controllers2/Utils/functions.ts (ou ailleurs)

interface ThrottleDebounceState<T> {
    isThrottled: boolean; // True si on est dans la période de throttle post-exécution leading
    throttleTimeoutId: NodeJS.Timeout | null; // Timer pour finir la période de throttle

    debounceTimeoutId: NodeJS.Timeout | null; // Timer pour l'exécution trailing (debouncée)
    hasNextCallScheduled: boolean; // True si une exécution trailing est prévue

    // Promise pour l'exécution LEADING en cours
    leadingPromise: Promise<T> | null;
    // Promise pour l'exécution TRAILING potentielle (débouncée)
    trailingPromise: Promise<T> | null;
    trailingResolver: ((value: T) => void) | null;
    trailingRejecter: ((reason?: any) => void) | null;
}

const throttleDebounceStateMap: Map<string, ThrottleDebounceState<any>> = new Map();

/**
 * Combine Throttle (leading edge) et Debounce (trailing edge) pour une fonction asynchrone.
 * - Exécute fn() immédiatement au premier appel (leading).
 * - Pendant 'delayMs', les appels suivants ne ré-exécutent pas immédiatement.
 * - SI des appels arrivent pendant 'delayMs', une unique exécution supplémentaire
 *   est planifiée et débouncée ('debounceDelayMs' après le dernier appel pendant throttle).
 *
 * @template T Le type de retour de la fonction fn (Promise<T>).
 * @param key Clé unique pour l'opération.
 * @param fn Fonction asynchrone à exécuter.
 * @param delayMs Période de throttle après l'exécution leading ET délai de debounce pour la trailing.
 * @returns Promise qui se résout avec le résultat de l'exécution (leading ou trailing si déclenchée).
 */
export async function throttleDebounceAsync<T>(
    key: string,
    fn: () => Promise<T>,
    delayMs: number = 2000 // Un seul délai pour simplifier (throttle et debounce)
): Promise<T> {

    let state = throttleDebounceStateMap.get(key);

    if (!state) {
        state = {
            isThrottled: false,
            throttleTimeoutId: null,
            debounceTimeoutId: null,
            hasNextCallScheduled: false,
            leadingPromise: null,
            trailingPromise: null,
            trailingResolver: null,
            trailingRejecter: null
        };
        throttleDebounceStateMap.set(key, state);
    }

    // --- Est-on dans la période de throttle après une exécution "leading" ? ---
    if (state.isThrottled) {
        new Logs(`throttleDebounceAsync[${key}]`).log(`⏳ Appel pendant throttle. Planification exécution trailing (débouncée)...`);

        // Annule le timer de debounce précédent pour le réarmer (debounce)
        if (state.debounceTimeoutId) {
            clearTimeout(state.debounceTimeoutId);
        }

        state.hasNextCallScheduled = true; // Marque qu'on DOIT faire un appel après

        // Crée (ou récupère) la promesse pour l'exécution TRAILING débouncée
        if (!state.trailingPromise) {
            state.trailingPromise = new Promise<T>((resolve, reject) => {
                state!.trailingResolver = resolve;
                state!.trailingRejecter = reject;
            });
        }

        // Arme le timer de DEBOUNCE pour l'exécution TRAILING
        state.debounceTimeoutId = setTimeout(async () => {
            const currentState = throttleDebounceStateMap.get(key);
            if (!currentState || !currentState.hasNextCallScheduled || !currentState.trailingResolver || !currentState.trailingRejecter) {
                 console.error(`[ThrottleDebounce ${key}] État trailing invalide lors de l'exécution.`);
                 if(currentState) { // Nettoie proprement l'état si possible
                    currentState.debounceTimeoutId = null;
                    currentState.hasNextCallScheduled = false;
                    currentState.trailingPromise = null; // Réinitialise aussi la promesse
                 }
                return;
            }

            const { trailingResolver, trailingRejecter } = currentState;

            // Réinitialise l'état DEBOUNCE/TRAILING *avant* l'appel
             currentState.debounceTimeoutId = null;
             currentState.hasNextCallScheduled = false;
             currentState.trailingPromise = null; // Important pour le prochain cycle
             currentState.trailingResolver = null;
             currentState.trailingRejecter = null;


            new Logs(`throttleDebounceAsync[${key}]`).log(`⚡ TRAILING Exécution après debounce...`);
            try {
                // *** IMPORTANT: Marquer comme 'throttled' AUSSI pour l'exécution trailing ***
                // pour qu'elle ait sa propre période réfractaire après elle.
                currentState.isThrottled = true;
                 currentState.throttleTimeoutId = setTimeout(() => {
                     const finalState = throttleDebounceStateMap.get(key);
                     if(finalState) finalState.isThrottled = false;
                     new Logs(`throttleDebounceAsync[${key}]`).log(`✅ Fin période throttle POST-TRAILING.`);
                 }, delayMs);


                 // Exécute fn() et capture la promesse
                 const trailingResultPromise = fn();
                // Stocke la promesse trailing (même si on ne la retourne pas aux appelants originaux pendant throttle)
                 currentState.leadingPromise = trailingResultPromise; // Utilise leadingPromise pour stocker la "dernière exécutée"

                 const result = await trailingResultPromise;
                 trailingResolver(result); // Résout la promesse TRAILING que les appelants attendaient

            } catch (error) {
                trailingRejecter(error); // Rejette la promesse TRAILING
                 // Stocke l'échec aussi
                 currentState.leadingPromise = Promise.reject(error);
            }

        }, delayMs); // Utilise le même délai pour le debounce trailing

        // Pendant la période de throttle, retourne la promesse TRAILING qui vient d'être (ré)initialisée
        return state.trailingPromise;

    } else {
        // --- Exécution Immédiate (Leading Edge) ---
        new Logs(`throttleDebounceAsync[${key}]`).log(`⚡ LEADING Exécution immédiate...`);

        state.isThrottled = true; // Démarre la période de throttle

        // Programme la fin de la période de throttle
        state.throttleTimeoutId = setTimeout(() => {
            const currentState = throttleDebounceStateMap.get(key);
             if (currentState) {
                currentState.isThrottled = false;
                new Logs(`throttleDebounceAsync[${key}]`).log(`✅ Fin période throttle POST-LEADING.`);
             }
        }, delayMs);


         try {
             // Exécute fn() immédiatement et capture sa promesse
              const leadingPromise = fn();
             state.leadingPromise = leadingPromise; // Stocke la promesse de l'exécution LEADING
             // Pas besoin de trailingPromise ici, on retourne directement la leading

              const result = await leadingPromise; // Attend le résultat pour le retourner
             return result;
         } catch (error) {
             new Logs(`throttleDebounceAsync[${key}]`).notifyErrors(`❌ Erreur lors de l'exécution LEADING`, {}, error);
             // Stocke l'échec pour les éventuels appels suivants pendant le throttle
             state.leadingPromise = Promise.reject(error);
             throw error; // Propage l'erreur à l'appelant immédiat
         }
    }
}