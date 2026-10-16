// api/chat.js
// Función de Vercel: recibe la consulta del alumno y llama a la API de Anthropic desde el servidor.
// La API Key NO viaja desde el navegador: se configura en Vercel > Settings > Environment Variables
// con el nombre ANTHROPIC_API_KEY.

const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 10;

// ---------------------------------------------------------------------------
// BASE DE CONOCIMIENTO
// Cada bloque dice qué tan confiable es. El bot recibe esa etiqueta y la usa
// para decirle al alumno qué está confirmado y qué no.
// ---------------------------------------------------------------------------
const KNOWLEDGE_BASE = `
## GRUPO A — Cargado en la versión 1 del bot (todavía conviene confirmarlo con el reglamento)

Asistencia
- La asistencia mínima requerida es del 75% en la mayoría de las materias.
- Las faltas justificadas se presentan con documentación. (La base NO aclara si las faltas justificadas dejan de computar para el 75%.)
- La inasistencia reiterada puede derivar en pérdida de regularidad.

Recuperatorios
- Existe un recuperatorio por materia al final del cuatrimestre.

Correlatividades
- Las materias tienen correlatividades obligatorias.
- Teología Moral es correlativa de Teología Dogmática.

Trámites
- Los cambios de comisión se hacen en los primeros días de clase y requieren autorización de la cátedra.
- Los certificados se solicitan en secretaría (5 a 7 días hábiles).

## GRUPO B — Respuestas orientativas SIN fuente oficial confirmada (a verificar con secretaría o reglamento)

- Faltas en materias de doble falta: si cada clase cuenta como 2 inasistencias, el margen de faltas
  se calcula con la cantidad total de clases del cuatrimestre y las faltas acumuladas.
- Día de campus cancelado: se presume que una jornada suspendida oficialmente no computa inasistencia.
- Cambio de carrera dentro de la FCE para alguien que ingresó en 2025: se presume que rige el plan vigente
  al momento del cambio, con reconocimiento de materias comunes. Debe confirmarse el plan aplicable.
- Doble titulación: no hay una cantidad de materias por cuatrimestre confirmada.
- Promedio de una materia: se presume que cuenta la nota del examen final, pero depende de la cátedra.
- Cantidad de instancias para rendir un final y vigencia de la regularidad: dato NO confirmado.
- Materias que se dictan una sola vez al año: dato NO confirmado, depende del plan y del calendario.
`;

function cleanName(name) {
  if (typeof name !== 'string') return 'estudiante';
  const cleaned = name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
  return cleaned || 'estudiante';
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const valid = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-MAX_HISTORY_MESSAGES);
  // La conversación tiene que empezar con un mensaje del alumno.
  while (valid.length && valid[0].role !== 'user') valid.shift();
  return valid;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falta la variable de entorno ANTHROPIC_API_KEY');
    return res.status(500).json({ error: 'Servidor sin configurar' });
  }

  try {
    const { message, history, studentName } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Missing message' });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: 'Mensaje demasiado largo' });
    }

    const messages = [...cleanHistory(history), { role: 'user', content: message.trim() }];

    const system = `Sos el Asistente de Atención al Estudiante de la Facultad de Ciencias Empresariales (FCE) de la Universidad Austral. Estás hablando con ${cleanName(studentName)}.
Esta es una versión de prueba (MVP): tus respuestas son orientativas y no reemplazan a secretaría.

Tu base de conocimiento:
${KNOWLEDGE_BASE}

CÓMO RESPONDER
1. Respondé en español rioplatense, de forma cálida y breve.
2. Respondé con lo que sabés. No derives a secretaría por defecto: derivá solo cuando de verdad haga falta una gestión humana o cuando no tengas ningún dato útil.
3. Decí siempre qué parte es información cargada y qué parte no está confirmada. Con información del GRUPO A decí "según la información que tenemos cargada" (no digas "confirmado"). Con información del GRUPO B, aclará que es orientativa y que conviene confirmarla.
4. Si necesitás datos del caso para dar una respuesta útil (carrera, plan, cantidad de clases, faltas acumuladas), preguntáselos de a una pregunta por vez.
5. Si la consulta es un trámite personal que requiere revisar el legajo o una firma, explicá lo que sepas del procedimiento y recién ahí sugerí contactar a secretaría académica.
6. Si no tenés ningún dato sobre el tema, decilo con claridad ("No tengo información cargada sobre eso") y sugerí consultarlo en secretaría académica. No nombres otras oficinas, áreas, sitios web ni mails que no estén en tu base.
7. Usá SOLO lo que está en tu base. Nunca agregues reglas, plazos, cantidades, consecuencias ni excepciones que no estén escritas ahí (por ejemplo, no afirmes si las faltas justificadas dejan de computar). Si el alumno pregunta algo así, decí que tu base no lo aclara y sugerí confirmarlo en secretaría académica.
8. Cálculo de faltas: el máximo de faltas es el 25% del total de clases, REDONDEADO HACIA ABAJO (ejemplo: 30 clases → 7,5 → máximo 7 faltas). Mostrá la cuenta en una línea. ANTES de calcular, preguntá siempre (una pregunta por vez) si la materia cuenta doble falta por clase, y esperá la respuesta. Si la materia cuenta doble falta, después de calcular el máximo de faltas decí también a cuántas clases completas equivale (cada clase suma 2 faltas, así que el número de clases es el máximo de faltas dividido 2, redondeado hacia abajo; ejemplo: 7 faltas → 3 clases completas, porque una cuarta clase sumaría 8) y aclará que es una cuenta orientativa.
9. Si el alumno solo saluda, respondé el saludo en una línea y preguntale en qué lo podés ayudar, sin mencionar a secretaría.
10. Escribí en texto plano: no uses asteriscos, negritas, títulos ni viñetas con símbolos. Si necesitás enumerar, usá frases cortas o "primero", "segundo".
11. Si el tema está en el GRUPO B (por ejemplo el promedio de una materia), contá lo que dice tu base como algo orientativo y no confirmado, y aclará lo que no sabés. No agregues generalizaciones que no estén escritas (por ejemplo "en toda la facultad no hay una regla única"): decí solo "mi base indica que depende de la cátedra".`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, errorData);
      return res.status(502).json({ error: 'No se pudo obtener respuesta del asistente' });
    }

    const data = await response.json();
    const botResponse = data.content && data.content[0] && data.content[0].text;
    if (!botResponse) {
      return res.status(502).json({ error: 'Respuesta vacía del asistente' });
    }

    return res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
