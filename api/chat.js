// api/chat.js
// Vercel Function to proxy requests to Anthropic API
// This avoids CORS errors by making the API call server-side

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, apiKey } = req.body;

        // Validate inputs
        if (!message || !apiKey) {
            return res.status(400).json({ error: 'Missing message or apiKey' });
        }

        const KNOWLEDGE_BASE = `
# Reglamento y Consultas Frecuentes - FCE Austral

## Asistencia
- La asistencia mínima requerida es del 75% en la mayoría de las materias
- Faltas justificadas deben presentarse con documentación
- La inasistencia reiterada puede derivar en pérdida de regularidad

## Recuperatorios
- Existe un recuperatorio por materia al final del cuatrimestre
- Aplica a estudiantes que no alcanzaron la nota mínima (4/10)
- Se puede hacer aunque hayas aprobado para mejorar nota

## Correlatividades
- Las materias tienen correlatividades obligatorias
- Teología Moral es correlativa de Teología Dogmática
- Algunas requieren tener otras aprobadas previamente

## Trámites y Plazos
- La inscripción a materias se realiza en períodos específicos
- Los cambios de comisión se hacen en los primeros días de clase
- Los certificados se solicitan en secretaría (5-7 días hábiles)

## Requisitos de Título
- Se deben tener todas las materias aprobadas
- Se requiere realizar trabajo integrador o seminario según carrera
- La defensa de tesis puede ser presencial o virtual

## Ayudas Económicas
- Existen becas para estudiantes con buen desempeño
- Las becas de financiamiento están disponibles según necesidad
- Se solicitan en períodos específicos

## Horarios y Comisiones
- Los horarios varían según materia y cuatrimestre
- Los cambios requieren autorización de la cátedra
- Consultar el calendario académico para períodos de inscripción

## Planes de Estudio
- Los planes vigentes están en secretaría
- Estudiantes con planes anteriores pueden seguir ese plan
- Las equivalencias se consultan en secretaría

## Materias por Carrera
- Digital Business y Public Accounting comparten algunas materias
- Materias obligatorias según plan de estudios vigente
- Consultar con secretaría sobre materias optativas y electivas
`;

        // Call Anthropic API from server-side
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                system: `Eres un asistente de atención al estudiante de la Facultad de Ciencias Empresariales de Universidad Austral.

Tu rol es responder preguntas administrativas basándote ÚNICAMENTE en este conocimiento:

${KNOWLEDGE_BASE}

IMPORTANTE:
- Si la pregunta está cubierta, responde con precisión y claridad
- Si NO está en el conocimiento, responde: "No tengo información sobre eso. Por favor, contactate con secretaría"
- Nunca inventes respuestas
- Responde en español, de forma concisa y amable`,
                messages: [{ role: 'user', content: message }]
            })
        });

        // Check if response is OK
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Anthropic API error:', errorData);
            return res.status(response.status).json({
                error: 'API Error',
                details: errorData.message || 'Unknown error'
            });
        }

        const data = await response.json();
        const botResponse = data.content[0].text;

        // Return the bot response
        res.status(200).json({ response: botResponse });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
