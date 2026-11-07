# Generación de preguntas de práctica (MOD-03)

## Prompt (TASK-0027)
El prompt no se duplica: se reutiliza el de `backend/app/pruebas/instrucciones.py`
(`instrucciones_sistema` y `construir_entrada`), sin modificarlo.

Reglas que impone al modelo:
- Preguntas de opción múltiple con 4 alternativas y una sola correcta.
- Cada pregunta lleva un **fundamento literal** tomado del texto fuente.
- Cada pregunta incluye explicación y conceptos asociados.
- Se pide una cantidad por nivel de dificultad (fácil, media, difícil).
- Acepta `nivel_estudiante` (0 a 1) y una lista `evitar` de enunciados ya vistos.

## Esquema JSON de respuesta del endpoint
`POST /api/preguntas/generar` → `{exito, datos}` con
`datos = {id_tema, dificultad, distribucion, modelo, huella_fuente, preguntas[]}`.
Cada pregunta: `{id, enunciado, dificultad, opciones[{id, texto}], correcta, explicacion, fundamento, conceptos[]}`.

## Criterios de dificultad
Perfil de reparto (fácil/media/difícil) según la dificultad solicitada
(`backend/app/pruebas/distribucion.py`):
- fácil: 75 / 20 / 5 %
- media: 20 / 60 / 20 %
- difícil: 5 / 20 / 75 %

Capacidad: 1 pregunta por cada 300 caracteres de texto fuente, máximo 25.

## Control de calidad en el backend
El backend no confía en la IA: `analizar_preguntas` descarta preguntas sin fundamento,
ambiguas o duplicadas. Si faltan, se hacen hasta 3 rondas de reparación; si no se
completa, se lanza `GeneracionIncompleta`.