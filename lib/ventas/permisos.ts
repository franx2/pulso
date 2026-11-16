/**
 * Permisos del módulo de ventas, con los MISMOS códigos que usa Fudo: así un
 * rol importado de Fudo ("Camarero", "Cajero") trae sus permisos tal cual y
 * se puede editar acá con la misma lógica.
 *
 * Fudo tiene 157 permisos; acá se listan los que este módulo ya usa. Los demás
 * que traiga un rol importado se guardan igual (no se pierden al editarlo),
 * pero no se muestran porque todavía no gobiernan nada.
 */

export const PERMISOS = [
  { codigo: "create_additions", grupo: "Pedidos", etiqueta: "Abrir ventas y cargar productos" },
  { codigo: "cancel_additions", grupo: "Pedidos", etiqueta: "Anular productos ya enviados a cocina" },
  { codigo: "change_addition_price", grupo: "Pedidos", etiqueta: "Cambiar el precio de un producto en la venta" },
  { codigo: "move_additions", grupo: "Pedidos", etiqueta: "Cambiar la venta de mesa" },
  { codigo: "assign_waiter", grupo: "Pedidos", etiqueta: "Asignar o cambiar el mozo" },
  { codigo: "print_control", grupo: "Pedidos", etiqueta: "Imprimir la precuenta" },
  { codigo: "create_discounts", grupo: "Cobro", etiqueta: "Hacer descuentos" },
  { codigo: "create_payments", grupo: "Cobro", etiqueta: "Cobrar" },
  { codigo: "create_tips", grupo: "Cobro", etiqueta: "Registrar propinas" },
  { codigo: "close_sales", grupo: "Cobro", etiqueta: "Cerrar ventas" },
  { codigo: "cancel_sales", grupo: "Cobro", etiqueta: "Anular ventas" },
  { codigo: "list_sales", grupo: "Cobro", etiqueta: "Ver el historial de ventas" },
  // En Fudo abrir y cerrar caja es "arqueo" (cash count); admin_cash_registers
  // es configurar qué cajas existen.
  { codigo: "create_cash_counts", grupo: "Caja", etiqueta: "Abrir y cerrar la caja" },
  { codigo: "create_cash_movements", grupo: "Caja", etiqueta: "Registrar retiros e ingresos de caja" },
  { codigo: "show_estimated_on_open_cash_counts", grupo: "Caja", etiqueta: "Ver cuánto debería haber en la caja" },
  { codigo: "update_ingredients", grupo: "Stock", etiqueta: "Crear y editar ingredientes" },
  { codigo: "update_stock", grupo: "Stock", etiqueta: "Contar stock y cargar ingresos o mermas" },
  { codigo: "admin_rooms", grupo: "Configuración", etiqueta: "Configurar salones y mesas" },
  { codigo: "update_products", grupo: "Configuración", etiqueta: "Editar productos, precios y recetas" },
  { codigo: "admin_payment_types", grupo: "Configuración", etiqueta: "Configurar medios de pago" },
  { codigo: "admin_roles", grupo: "Configuración", etiqueta: "Configurar roles y permisos" },
] as const;

export type Permiso = (typeof PERMISOS)[number]["codigo"];

const NEGACIONES: [string, Permiso][] = [
  ["cannot_close_sale", "close_sales"],
  ["cannot_apply_discount", "create_discounts"],
  ["cannot_cancel_addition", "cancel_additions"],
];

/** Sin rol de ventas asignado, el rol de Pulso elige uno de los importados por nombre. */
const ROL_POR_DEFECTO: Record<"ENCARGADO" | "EMPLEADO", string> = {
  ENCARGADO: "Encargado",
  EMPLEADO: "Camarero",
};

/** Lo mínimo para poder atender si todavía no se importó ningún rol. */
const BASICOS: Permiso[] = ["create_additions", "print_control"];

export type Permisos = Record<Permiso, boolean>;

/**
 * Qué puede hacer alguien en ventas. El admin de Pulso puede todo: es el
 * dueño, y un rol mal configurado no lo puede dejar afuera de su negocio.
 */
export function permisosDe(
  rolPulso: string | undefined,
  rolVenta: { permisos: string[] } | null,
  rolesPorNombre: Map<string, { permisos: string[] }>
): Permisos {
  const todos = rolPulso === "ADMIN";
  const lista =
    rolVenta?.permisos ??
    (rolPulso === "ENCARGADO" || rolPulso === "EMPLEADO" ? rolesPorNombre.get(ROL_POR_DEFECTO[rolPulso])?.permisos : null) ??
    BASICOS;
  const tiene = new Set(lista);
  const permisos = Object.fromEntries(PERMISOS.map((p) => [p.codigo, todos || tiene.has(p.codigo)])) as Permisos;
  // Fudo también tiene permisos que NIEGAN ("cannot_close_sale"): ganan sobre
  // el permiso, salvo para el admin.
  if (!todos) for (const [niega, permiso] of NEGACIONES) if (tiene.has(niega)) permisos[permiso] = false;
  return permisos;
}
