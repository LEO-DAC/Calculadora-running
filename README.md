# Calculadora de Running

Aplicación para calcular ritmos de carrera, km en backyard, y muchos datos más relacionados con el running.
Web minimalista con estilo iOS. Incluye dos calculadoras:

## 1. Ritmo
Calcula el ritmo de carrera por kilómetro.

- **Distancia:** 5K, 10K, 15K, 21K (media maratón, 21.0975 km), Maratón (42.195 km) u **Otro** (distancia personalizada).
- **Tiempo:** horas, minutos y segundos.
- **Resultado:** ritmo (min/km), velocidad (km/h), distancia y tiempo total.

## 2. Backyard
Calcula los kilómetros totales de un backyard ultra (vueltas de **6.7 km**).

- **Vueltas completas:** número entero.
- **Vuelta incompleta (opcional):** interruptor que habilita un campo de km extra.
- **Resultado:** `km totales = vueltas × 6.7 + km extra`.

## Características
- HTML, CSS y JavaScript puros (sin dependencias).
- Diseño responsivo: iPhone, Android, iPad y navegadores de escritorio.
- Modo claro y oscuro automático.
- Validación: solo valores numéricos; avisos con `alert` si faltan datos.

## Estructura
| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la interfaz |
| `styles.css` | Estilos (tema iOS, responsivo, modo oscuro) |
| `app.js` | Lógica, validaciones y cálculos |

## Uso
Abre `index.html` en cualquier navegador, o sírvelo con un servidor local (por ejemplo XAMPP).

## Licencia
Distribuido bajo la licencia GNU GPL v3. Consulta el archivo [LICENSE](LICENSE).
