const HEADER =
  "nombres,apellidos,documento,fecha_nacimiento,celular,email,emergencia_nombre,emergencia_celular,emergencia_parentesco,acudiente_nombre,acudiente_documento,acudiente_telefono,acudiente_parentesco";

const EJEMPLOS = [
  "Carlos,Gómez,1098765432,1990-04-15,3001112233,carlos@correo.com,Ana Gómez,3004445566,Esposa,,,,",
  "Sofía,Ramírez,1012345678,2012-09-30,,,,,,Laura Ramírez,52000111,3007778899,Madre",
];

export async function GET() {
  const csv = `${HEADER}\n${EJEMPLOS.join("\n")}\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-clientes.csv"',
    },
  });
}
