import { z } from 'zod';

export const exporterSchema = z.object({
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  type: z.string().min(1, 'El tipo es obligatorio'),
});

export const producerSchema = z.object({
  producerId: z.string().min(1, 'El ID de productor es obligatorio'),
  shortName: z.string().min(1, 'El nombre corto es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
  rut: z.string().optional(),
  giro: z.string().optional(),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  ciudad: z.string().optional(),
  status: z.enum(['activo', 'inactivo']).default('activo'),
});

export const binMaterialSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
  type: z.string().min(1, 'El tipo es obligatorio'),
});

export const otherClientSchema = z.object({
  clientId: z.string().min(1, 'El ID de cliente es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  type: z.enum(['embalaje', 'frio_hortofruticola', 'fruta'], { required_error: 'El tipo es obligatorio.'}),
  unit: z.enum(['Bins', 'Pallets'], { required_error: 'La unidad es obligatoria.'}),
  status: z.enum(['activo', 'inactivo']).default('activo'),
});

export const packagingMasterSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  clientId: z.string().min(1, 'El ID de cliente es obligatorio'),
});

export const packagingReceptionItemSchema = z.object({
    packagingMasterId: z.string().min(1, "Debe ingresar un código de artículo válido."),
    packagingMasterCode: z.string().min(1, "Debe ingresar un código de artículo."),
    packagingMasterName: z.string(),
    palletCount: z.coerce.number().min(1, "La cantidad debe ser al menos 1."),
});

export const packagingReceptionSchema = z.object({
    clientId: z.string().min(1, "Debe seleccionar un cliente."),
    document: z.string().min(1, "El documento es obligatorio."),
    items: z.array(packagingReceptionItemSchema).min(1, "Debe agregar al menos un artículo."),
});

export const stockLocationSchema = z.object({
  receptionId: z.string(),
  location: z.string(),
  available: z.number(),
});
export type StockLocation = z.infer<typeof stockLocationSchema>;


const packagingExitItemLocationSchema = z.object({
    locationKey: z.string(),
    receptionId: z.string(),
    itemIndex: z.number(),
    palletsToWithdraw: z.coerce.number().min(0),
    locationString: z.string().optional(),
    available: z.number().optional(),
});

export const packagingExitItemSchema = z.object({
    packagingMasterId: z.string().min(1, "Debe ingresar un código de artículo válido."),
    packagingMasterCode: z.string().min(1, "Debe ingresar un código de artículo."),
    packagingMasterName: z.string(),
    palletCount: z.coerce.number().min(1, "La cantidad debe ser mayor a 0."),
    locations: z.array(packagingExitItemLocationSchema).optional(),
});

export const packagingExitSchema = z.object({
    clientId: z.string().min(1, "Debe seleccionar un cliente."),
    document: z.string().optional(),
    items: z.array(packagingExitItemSchema).min(1, "Debe agregar al menos un artículo."),
});



export const packingSchema = z.object({
    exporterId: z.string().min(1, 'El exportador es obligatorio'),
    name: z.string().min(1, 'El nombre es obligatorio'),
});

export const userMasterSchema = z.object({
  userName: z.string().min(1, 'El nombre de usuario es obligatorio'),
  profileId: z.string().min(1, 'El ID de perfil es obligatorio'),
});

const modulePermissionSchema = z.union([
  z.string(),
  z.object({
    name: z.literal('Dashboard'),
    fixedExporterId: z.string(),
  }),
  z.object({
      name: z.literal('Embalajes'),
      allowedTabs: z.array(z.string())
  }),
  z.object({
      name: z.literal('Socios Comerciales'),
      allowedTabs: z.array(z.string())
  }),
  z.object({
    name: z.literal('Bins y Materiales'),
    allowedTabs: z.array(z.string())
  })
]);

export const profileSchema = z.object({
  profileId: z.string().min(1, 'El ID de perfil es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  modulesAccess: z.preprocess((val) => {
    // This function runs before any other validation
    // If we receive a string (from CSV or bad data in DB), we try to parse it.
    if (typeof val === 'string') {
      try {
        // First, try to parse it as JSON, which is how it was incorrectly stored.
        return JSON.parse(val);
      } catch (e) {
        // If it's not JSON, assume it's a comma-separated list (from CSV).
        return val.split(',').map(s => s.trim());
      }
    }
    // If it's already an array or something else, pass it through.
    return val;
  }, z.array(modulePermissionSchema).default([])), // Now validate that it's an array of the correct shape.
});


export const receptionLotSchema = z.object({
    exporterId: z.string().optional(),
    producerId: z.string().min(1, "Productor es obligatorio"),
    displayLotId: z.string().optional(),
    document: z.string().min(1, "Documento es obligatorio"),
    variety: z.enum(['SANTINA', 'LAPINS', 'REGINA', 'KORDIA', 'SKEENA', 'SWEETHEART', 'SYLVIA', 'SUNBURST'], {
      required_error: "Debe seleccionar una variedad.",
    }),
    binCount: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).positive("La cantidad de bins debe ser mayor a 0"),
    toteCount: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).positive("La cantidad de totes debe ser mayor a 0"),
    emptyTotes: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).optional(),
    noTotes: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).optional(),
    status: z.string().optional(),
    totalWeight: z.number().optional(),
    preHydroTemp: z.number().optional(),
    postHydroTemp: z.number().optional(),
    createdAt: z.any().optional(),
});

export const otherFruitReceptionItemSchema = z.object({
    clientLotId: z.string().optional(),
    productCode: z.string().min(1, "El código es obligatorio."),
    productName: z.string().min(1, "El nombre es obligatorio."),
    quantity: z.coerce.number().min(1, "La cantidad debe ser al menos 1."),
    weight: z.coerce.number({ invalid_type_error: "El peso debe ser un número." }).optional(),
});

export const otherFruitReceptionSchema = z.object({
    clientId: z.string().min(1, "Debe seleccionar un cliente."),
    document: z.string().min(1, "El documento es obligatorio."),
    temperature: z.coerce.number().optional(),
    items: z.array(otherFruitReceptionItemSchema).min(1, "Debe agregar al menos un producto."),
});

const otherFruitExitItemLocationSchema = z.object({
    locationKey: z.string(),
    receptionId: z.string(),
    itemIndex: z.number(),
    quantityToWithdraw: z.coerce.number().min(0),
});

export const otherFruitExitItemSchema = z.object({
    productCode: z.string().min(1, "Debe seleccionar un producto."),
    productName: z.string(),
    quantity: z.coerce.number().min(0),
    locations: z.array(otherFruitExitItemLocationSchema),
});
export type OtherFruitExitItem = z.infer<typeof otherFruitExitItemSchema>;


export const otherFruitExitSchema = z.object({
    clientId: z.string().min(1, "Debe seleccionar un cliente."),
    document: z.string().optional(),
    items: z.array(otherFruitExitItemSchema).min(1),
});

export const hidrocoolerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  binCount: z.coerce.number().positive("La cantidad de bins debe ser un número positivo."),
});

export const businessEntitySchema = z.object({
  rut: z.string().min(1, 'El RUT es obligatorio'),
  razonSocial: z.string().min(1, 'La Razón Social es obligatoria'),
  direccion: z.string().min(1, 'La Dirección es obligatoria'),
  ciudad: z.string().min(1, 'La Ciudad es obligatoria'),
  comuna: z.string().min(1, 'La Comuna es obligatoria'),
  giro: z.string().min(1, 'El Giro/Actividad es obligatorio'),
  actividadComercial: z.string().min(1, 'La Act. Comercial es obligatoria'),
});
