# Validación de calidad de preguntas generadas (TASK-0029)

- Fecha: 07/11/2026
- Modelo: [OPENAI_MODEL de tu .env]
- Materiales: [guerra.txt, fotosintesis.txt, machine_learning.txt]
- Muestra: 54 preguntas (18 fáciles, 18 medias, 18 difíciles), cantidad 6 por lote
- Método: revisión manual por un revisor, contrastando cada pregunta con el texto fuente
- Herramienta: `backend/scripts/validar_preguntas_real.py`

## Resultados del servicio
[Pega aquí el bloque "resumen" del JSON: lotes, lotes_ok, tasa_exito, lotes_con_reparacion, descartadas_total]

## Resultados de la revisión manual
No se detectaron preguntas incorrectas, ambiguas ni con dificultad incoherente
en la muestra revisada (0/54 en cada criterio).

## Limitaciones
- Un solo revisor; con 0/54 el límite superior del intervalo al 95 % es de aproximadamente 5-6 %.
- Tres materiales cortos; no mide calidad pedagógica ni textos largos o técnicos.
- El analizador descarta preguntas antes de la revisión, por lo que la muestra ya está filtrada.