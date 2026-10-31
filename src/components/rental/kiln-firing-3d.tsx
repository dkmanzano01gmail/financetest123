import { useMemo, useState } from "react";
import { Box, Layers3, RotateCcw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SupportInventoryItem = {
  height_cm: number;
  quantity: number;
};

type RentalSlot = {
  id: string;
  title?: string | null;
  firing_date?: string | null;
  firing_type?: string | null;
};

type RentalOrderItem = {
  piece_name?: string | null;
  quantity?: number | string | null;
  width_cm?: number | string | null;
  depth_cm?: number | string | null;
  height_cm?: number | string | null;
};

type RentalOrder = {
  id: string;
  slot_id?: string | null;
  status?: string | null;
  code?: string | null;
  rental_customers?: { name?: string | null } | null;
  rental_order_items?: RentalOrderItem[] | null;
};

type RentalSettings = {
  kiln_shelf_diameter_cm?: number | string | null;
  kiln_internal_height_cm?: number | string | null;
  kiln_wall_clearance_cm?: number | string | null;
  kiln_shelf_thickness_cm?: number | string | null;
  kiln_supports_per_level?: number | string | null;
  kiln_support_inventory?: unknown;
  glaze_spacing_cm?: number | string | null;
  biscuit_vertical_max_height_cm?: number | string | null;
  biscuit_vertical_max_ratio?: number | string | null;
  biscuit_stack_max_pieces?: number | string | null;
  biscuit_stack_height_factor?: number | string | null;
  biscuit_stackable_keywords?: string | null;
} | null;

type PieceUnit = {
  id: string;
  name: string;
  orderCode: string;
  customerName: string;
  width: number;
  depth: number;
  height: number;
  originalWidth: number;
  originalDepth: number;
  originalHeight: number;
  effectiveWidth: number;
  effectiveDepth: number;
  unitCount: number;
  loadingMode: "horizontal" | "vertical" | "stacked";
  color: string;
};

type PiecePlacement = PieceUnit & {
  x: number;
  y: number;
  packedWidth: number;
  packedDepth: number;
  visualWidth: number;
  visualDepth: number;
};

type PackedTray = {
  placements: PiecePlacement[];
  maxHeight: number;
  occupiedArea: number;
};

type SupportSet = {
  id: string;
  height: number;
};

type PlannedShelf = PackedTray & {
  z: number;
  supportSetsAbove: SupportSet[];
};

type KilnPlan = {
  shelves: PlannedShelf[];
  overflow: PieceUnit[];
  totalPieces: number;
  supportsUsed: number;
  supportSetsUsed: number;
  usableDiameter: number;
  occupiedPercent: number;
  overflowPieceCount: number;
};

const PIECE_COLORS = [
  "#9a4e2d",
  "#bd7a45",
  "#6f7b68",
  "#a28c5f",
  "#7b5261",
  "#4f6f73",
  "#b25f58",
  "#75644d",
];

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePieceName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function physicalPieceCount(pieces: PieceUnit[]) {
  return pieces.reduce((sum, piece) => sum + piece.unitCount, 0);
}

function loadingModeLabel(piece: PieceUnit) {
  if (piece.loadingMode === "vertical") return "na vertical";
  if (piece.loadingMode === "stacked") return `pilha com ${piece.unitCount} peças`;
  return "individual";
}

function formatDate(value?: string | null) {
  if (!value) return "Data a definir";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function colorForOrder(code: string) {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  return PIECE_COLORS[hash % PIECE_COLORS.length];
}

function rectanglesOverlap(
  a: { x: number; y: number; width: number; depth: number },
  b: { x: number; y: number; width: number; depth: number },
) {
  const tolerance = 0.001;
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width - tolerance &&
    Math.abs(a.y - b.y) * 2 < a.depth + b.depth - tolerance
  );
}

function rectangleFitsCircle(x: number, y: number, width: number, depth: number, radius: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    [x - halfWidth, y - halfDepth],
    [x + halfWidth, y - halfDepth],
    [x + halfWidth, y + halfDepth],
    [x - halfWidth, y + halfDepth],
  ].every(([cornerX, cornerY]) => cornerX * cornerX + cornerY * cornerY <= radius * radius);
}

function tryPlaceOnTray(tray: PackedTray, piece: PieceUnit, radius: number) {
  const orientations = [
    {
      packedWidth: piece.effectiveWidth,
      packedDepth: piece.effectiveDepth,
      visualWidth: piece.width,
      visualDepth: piece.depth,
    },
    {
      packedWidth: piece.effectiveDepth,
      packedDepth: piece.effectiveWidth,
      visualWidth: piece.depth,
      visualDepth: piece.width,
    },
  ].filter(
    (orientation, index, all) =>
      index === 0 ||
      orientation.packedWidth !== all[0].packedWidth ||
      orientation.packedDepth !== all[0].packedDepth,
  );

  const step = 0.5;
  for (const orientation of orientations) {
    const { packedWidth, packedDepth } = orientation;
    if (Math.hypot(packedWidth, packedDepth) > radius * 2) continue;

    for (let y = -radius + packedDepth / 2; y <= radius - packedDepth / 2 + 0.001; y += step) {
      for (let x = -radius + packedWidth / 2; x <= radius - packedWidth / 2 + 0.001; x += step) {
        if (!rectangleFitsCircle(x, y, packedWidth, packedDepth, radius)) continue;
        const candidate = { x, y, width: packedWidth, depth: packedDepth };
        if (
          tray.placements.some((placement) =>
            rectanglesOverlap(candidate, {
              x: placement.x,
              y: placement.y,
              width: placement.packedWidth,
              depth: placement.packedDepth,
            }),
          )
        ) {
          continue;
        }

        tray.placements.push({ ...piece, ...orientation, x, y });
        tray.maxHeight = Math.max(tray.maxHeight, piece.height);
        tray.occupiedArea += packedWidth * packedDepth;
        return true;
      }
    }
  }
  return false;
}

function packPiecesOnTrays(pieces: PieceUnit[], radius: number) {
  const trays: PackedTray[] = [];
  const overflow: PieceUnit[] = [];
  const sortedPieces = [...pieces].sort(
    (a, b) =>
      b.effectiveWidth * b.effectiveDepth - a.effectiveWidth * a.effectiveDepth ||
      b.height - a.height,
  );

  for (const piece of sortedPieces) {
    let placed = trays.some((tray) => tryPlaceOnTray(tray, piece, radius));
    if (!placed) {
      const tray: PackedTray = { placements: [], maxHeight: 0, occupiedArea: 0 };
      placed = tryPlaceOnTray(tray, piece, radius);
      if (placed) trays.push(tray);
    }
    if (!placed) overflow.push(piece);
  }

  return { trays, overflow };
}

function findSmallestSupportCombination(sets: SupportSet[], requiredHeight: number) {
  if (sets.length === 0) return null;
  const precision = 10;
  const requiredKey = Math.ceil(requiredHeight * precision - 0.001);
  const largestSetKey = Math.max(...sets.map((set) => Math.round(set.height * precision)));
  const maxRelevantKey = requiredKey + largestSetKey;
  const combinations = new Map<number, number[]>([[0, []]]);

  sets.forEach((set, setIndex) => {
    const setKey = Math.round(set.height * precision);
    const snapshot = [...combinations.entries()];
    snapshot.forEach(([totalKey, indices]) => {
      const nextKey = totalKey + setKey;
      if (nextKey > maxRelevantKey) return;
      const nextIndices = [...indices, setIndex];
      const existing = combinations.get(nextKey);
      if (!existing || nextIndices.length < existing.length) {
        combinations.set(nextKey, nextIndices);
      }
    });
  });

  const best = [...combinations.entries()]
    .filter(([totalKey]) => totalKey >= requiredKey)
    .sort(([totalA, indicesA], [totalB, indicesB]) =>
      totalA === totalB ? indicesA.length - indicesB.length : totalA - totalB,
    )[0];

  return best ? { indices: best[1], totalHeight: best[0] / precision } : null;
}

function createKilnPlan({
  pieces,
  shelfDiameter,
  internalHeight,
  wallClearance,
  shelfThickness,
  supportsPerLevel,
  supportInventory,
}: {
  pieces: PieceUnit[];
  shelfDiameter: number;
  internalHeight: number;
  wallClearance: number;
  shelfThickness: number;
  supportsPerLevel: number;
  supportInventory: SupportInventoryItem[];
}): KilnPlan {
  const usableDiameter = Math.max(0, shelfDiameter - wallClearance * 2);
  const usableRadius = usableDiameter / 2;
  const { trays, overflow: footprintOverflow } = packPiecesOnTrays(pieces, usableRadius);
  const orderedTrays = [...trays].sort((a, b) => a.maxHeight - b.maxHeight);
  const supportSets = supportInventory.flatMap((item, itemIndex) =>
    Array.from(
      { length: Math.floor(numberValue(item.quantity) / Math.max(1, supportsPerLevel)) },
      (_, setIndex) => ({
        id: `${itemIndex}-${setIndex}`,
        height: numberValue(item.height_cm),
      }),
    ),
  );

  const availableSets = [...supportSets];
  const shelves: PlannedShelf[] = [];
  const verticalOverflow: PieceUnit[] = [];
  let z = Math.max(0, shelfThickness);
  let supportSetsUsed = 0;

  for (let index = 0; index < orderedTrays.length; index += 1) {
    const tray = orderedTrays[index];
    if (index === 0) {
      if (z + tray.maxHeight > internalHeight + 0.001) {
        verticalOverflow.push(...tray.placements);
        verticalOverflow.push(...orderedTrays.slice(index + 1).flatMap((item) => item.placements));
        break;
      }
      shelves.push({ ...tray, z, supportSetsAbove: [] });
      continue;
    }

    const previousShelf = shelves[shelves.length - 1];
    const supportCombination = findSmallestSupportCombination(
      availableSets,
      previousShelf.maxHeight,
    );
    if (!supportCombination) {
      verticalOverflow.push(...orderedTrays.slice(index).flatMap((item) => item.placements));
      break;
    }

    const nextZ = z + supportCombination.totalHeight + shelfThickness;
    if (nextZ + tray.maxHeight > internalHeight + 0.001) {
      verticalOverflow.push(...orderedTrays.slice(index).flatMap((item) => item.placements));
      break;
    }

    const selectedSets = supportCombination.indices.map((setIndex) => availableSets[setIndex]);
    previousShelf.supportSetsAbove = selectedSets;
    for (const setIndex of [...supportCombination.indices].sort((a, b) => b - a)) {
      availableSets.splice(setIndex, 1);
    }
    supportSetsUsed += selectedSets.length;
    z = nextZ;
    shelves.push({ ...tray, z, supportSetsAbove: [] });
  }

  const overflow = [...footprintOverflow, ...verticalOverflow];
  const totalShelfArea = shelves.length * Math.PI * usableRadius * usableRadius;
  const occupiedArea = shelves.reduce((sum, shelf) => sum + shelf.occupiedArea, 0);

  return {
    shelves,
    overflow,
    totalPieces: physicalPieceCount(pieces),
    supportsUsed: supportSetsUsed * supportsPerLevel,
    supportSetsUsed,
    usableDiameter,
    occupiedPercent: totalShelfArea > 0 ? Math.min(100, (occupiedArea / totalShelfArea) * 100) : 0,
    overflowPieceCount: physicalPieceCount(overflow),
  };
}

function KilnDiagram({
  plan,
  internalHeight,
  shelfThickness,
  rotation,
  selectedShelf,
}: {
  plan: KilnPlan;
  internalHeight: number;
  shelfThickness: number;
  rotation: number;
  selectedShelf: number | null;
}) {
  const width = 760;
  const height = 560;
  const centerX = width / 2;
  const baseY = 500;
  const horizontalScale = Math.min(5.2, 300 / Math.max(1, plan.usableDiameter));
  const depthScale = horizontalScale * 0.34;
  const verticalScale = Math.min(7.5, 390 / Math.max(1, internalHeight));
  const angle = (rotation * Math.PI) / 180;

  const project = (x: number, y: number, z: number) => {
    const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
    const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
    return {
      x: centerX + (rotatedX - rotatedY) * horizontalScale,
      y: baseY - z * verticalScale + (rotatedX + rotatedY) * depthScale,
    };
  };

  const polygon = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  const displayShelves =
    plan.shelves.length > 0
      ? plan.shelves
      : [
          {
            placements: [],
            maxHeight: 0,
            occupiedArea: 0,
            z: shelfThickness,
            supportSetsAbove: [],
          },
        ];
  const ellipseRadiusX = (plan.usableDiameter / 2) * horizontalScale * 1.42;
  const ellipseRadiusY = (plan.usableDiameter / 2) * depthScale * 1.42;

  const boxPolygons = (placement: PiecePlacement, shelfZ: number) => {
    const x1 = placement.x - placement.visualWidth / 2;
    const x2 = placement.x + placement.visualWidth / 2;
    const y1 = placement.y - placement.visualDepth / 2;
    const y2 = placement.y + placement.visualDepth / 2;
    const z1 = shelfZ;
    const z2 = shelfZ + placement.height;
    const b10 = project(x2, y1, z1);
    const b11 = project(x2, y2, z1);
    const b01 = project(x1, y2, z1);
    const t00 = project(x1, y1, z2);
    const t10 = project(x2, y1, z2);
    const t11 = project(x2, y2, z2);
    const t01 = project(x1, y2, z2);
    return {
      top: polygon([t00, t10, t11, t01]),
      left: polygon([b01, b11, t11, t01]),
      right: polygon([b10, b11, t11, t10]),
    };
  };

  const kilnBottom = project(0, 0, 0);
  const kilnTop = project(0, 0, internalHeight);
  const outerRadiusX = ellipseRadiusX + 12;
  const outerRadiusY = ellipseRadiusY + 5;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Visualização tridimensional da montagem planejada do forno"
      className="h-auto w-full"
    >
      <defs>
        <linearGradient id="kiln-shell" x1="0" x2="1">
          <stop offset="0%" stopColor="#6f665c" stopOpacity="0.06" />
          <stop offset="50%" stopColor="#a6957f" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#6f665c" stopOpacity="0.06" />
        </linearGradient>
        <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>

      <ellipse
        cx={kilnTop.x}
        cy={kilnTop.y}
        rx={outerRadiusX}
        ry={outerRadiusY}
        fill="#b2b3a3"
        fillOpacity="0.08"
        stroke="#6f665c"
        strokeDasharray="7 7"
        strokeOpacity="0.45"
      />
      <path
        d={`M ${kilnBottom.x - outerRadiusX} ${kilnBottom.y} L ${kilnTop.x - outerRadiusX} ${kilnTop.y} M ${kilnBottom.x + outerRadiusX} ${kilnBottom.y} L ${kilnTop.x + outerRadiusX} ${kilnTop.y}`}
        stroke="#6f665c"
        strokeDasharray="7 7"
        strokeOpacity="0.35"
      />
      <ellipse
        cx={kilnBottom.x}
        cy={kilnBottom.y}
        rx={outerRadiusX}
        ry={outerRadiusY}
        fill="url(#kiln-shell)"
        stroke="#6f665c"
        strokeOpacity="0.45"
      />

      {displayShelves.map((shelf, shelfIndex) => {
        const center = project(0, 0, shelf.z);
        const dimmed = selectedShelf !== null && selectedShelf !== shelfIndex;
        const nextShelf = displayShelves[shelfIndex + 1];
        const supportPoints = [
          [-plan.usableDiameter * 0.22, -plan.usableDiameter * 0.22],
          [plan.usableDiameter * 0.22, -plan.usableDiameter * 0.22],
          [plan.usableDiameter * 0.22, plan.usableDiameter * 0.22],
          [-plan.usableDiameter * 0.22, plan.usableDiameter * 0.22],
        ];

        return (
          <g key={`shelf-${shelfIndex}`} opacity={dimmed ? 0.18 : 1}>
            {nextShelf &&
              supportPoints.map(([x, y], supportIndex) => {
                const bottom = project(x, y, shelf.z);
                const top = project(x, y, nextShelf.z - shelfThickness);
                return (
                  <line
                    key={`support-${supportIndex}`}
                    x1={bottom.x}
                    y1={bottom.y}
                    x2={top.x}
                    y2={top.y}
                    stroke="#6a4a2f"
                    strokeWidth="7"
                    strokeLinecap="round"
                    opacity="0.8"
                  />
                );
              })}
            <ellipse
              cx={center.x}
              cy={center.y}
              rx={ellipseRadiusX}
              ry={ellipseRadiusY}
              fill="#d6d0bd"
              stroke={selectedShelf === shelfIndex ? "#84152a" : "#75644d"}
              strokeWidth={selectedShelf === shelfIndex ? 4 : 2}
              filter="url(#piece-shadow)"
            />
            {[...shelf.placements]
              .sort((a, b) => a.x + a.y - (b.x + b.y))
              .map((placement) => {
                const faces = boxPolygons(placement, shelf.z);
                return (
                  <g key={placement.id}>
                    <polygon points={faces.left} fill={placement.color} opacity="0.72" />
                    <polygon points={faces.right} fill={placement.color} opacity="0.88" />
                    <polygon
                      points={faces.top}
                      fill={placement.color}
                      stroke="#382b28"
                      strokeWidth="0.7"
                    />
                    <title>
                      {placement.name} · medidas informadas: {placement.originalWidth} ×{" "}
                      {placement.originalDepth} × {placement.originalHeight} cm ·{" "}
                      {loadingModeLabel(placement)} · {placement.customerName}
                    </title>
                  </g>
                );
              })}
            <text
              x={center.x + ellipseRadiusX + 14}
              y={center.y + 4}
              fontSize="13"
              fontWeight="700"
              fill="#382b28"
            >
              Andar {shelfIndex + 1} · {physicalPieceCount(shelf.placements)} peça(s)
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function KilnFiring3DPlanner({
  slots,
  orders,
  settings,
}: {
  slots: RentalSlot[];
  orders: RentalOrder[];
  settings: RentalSettings;
}) {
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [rotation, setRotation] = useState(-18);
  const [selectedShelf, setSelectedShelf] = useState<number | null>(null);
  const effectiveSlotId = selectedSlotId || slots[0]?.id || "";
  const selectedSlot = slots.find((slot) => slot.id === effectiveSlotId);

  const dimensions = useMemo(
    () => ({
      shelfDiameter: numberValue(settings?.kiln_shelf_diameter_cm, 52.5),
      internalHeight: numberValue(settings?.kiln_internal_height_cm, 45),
      wallClearance: numberValue(settings?.kiln_wall_clearance_cm, 1),
      shelfThickness: numberValue(settings?.kiln_shelf_thickness_cm, 1.5),
      supportsPerLevel: Math.max(1, Math.trunc(numberValue(settings?.kiln_supports_per_level, 4))),
      supportInventory: Array.isArray(settings?.kiln_support_inventory)
        ? (settings.kiln_support_inventory as SupportInventoryItem[])
        : [],
      biscuitVerticalMaxHeight: numberValue(settings?.biscuit_vertical_max_height_cm, 4),
      biscuitVerticalMaxRatio: numberValue(settings?.biscuit_vertical_max_ratio, 0.25),
      biscuitStackMaxPieces: Math.max(
        1,
        Math.trunc(numberValue(settings?.biscuit_stack_max_pieces, 3)),
      ),
      biscuitStackHeightFactor: numberValue(settings?.biscuit_stack_height_factor, 0.65),
      biscuitStackableKeywords: (
        settings?.biscuit_stackable_keywords || "bowl,tigela,cumbuca,caneca,xícara,xicara,copo"
      )
        .split(",")
        .map(normalizePieceName)
        .filter(Boolean),
    }),
    [settings],
  );

  const pieces = useMemo(() => {
    if (!selectedSlot) return [];
    const spacing =
      selectedSlot.firing_type === "glaze" ? numberValue(settings?.glaze_spacing_cm, 1) : 0;
    return orders
      .filter((order) => order.slot_id === selectedSlot.id && order.status !== "cancelled")
      .flatMap((order) =>
        (order.rental_order_items ?? []).flatMap((item, itemIndex) => {
          const quantity = Math.max(0, Math.min(500, Math.trunc(numberValue(item.quantity))));
          const width = numberValue(item.width_cm);
          const depth = numberValue(item.depth_cm);
          const height = numberValue(item.height_cm);
          if (width <= 0 || depth <= 0 || height <= 0) return [];
          const common = {
            name: item.piece_name || "Peça",
            orderCode: order.code || "Pedido",
            customerName: order.rental_customers?.name || "Cliente",
            originalWidth: width,
            originalDepth: depth,
            originalHeight: height,
            color: colorForOrder(order.code || order.id),
          };

          if (selectedSlot.firing_type === "biscuit") {
            const shortestBaseSide = Math.min(width, depth);
            const isFlat =
              height <= dimensions.biscuitVerticalMaxHeight &&
              height / Math.max(0.1, shortestBaseSide) <= dimensions.biscuitVerticalMaxRatio;

            if (isFlat) {
              const verticalHeight = shortestBaseSide;
              const verticalDepth = Math.max(width, depth);
              return Array.from({ length: quantity }, (_, unitIndex) => ({
                ...common,
                id: `${order.id}-${itemIndex}-vertical-${unitIndex}`,
                width: height,
                depth: verticalDepth,
                height: verticalHeight,
                effectiveWidth: height,
                effectiveDepth: verticalDepth,
                unitCount: 1,
                loadingMode: "vertical" as const,
              }));
            }

            const normalizedName = normalizePieceName(common.name);
            const canStack = dimensions.biscuitStackableKeywords.some((keyword) =>
              normalizedName.includes(keyword),
            );
            if (canStack) {
              const stacks: PieceUnit[] = [];
              for (let start = 0; start < quantity; start += dimensions.biscuitStackMaxPieces) {
                const stackCount = Math.min(dimensions.biscuitStackMaxPieces, quantity - start);
                const stackHeight =
                  height * (1 + (stackCount - 1) * dimensions.biscuitStackHeightFactor);
                stacks.push({
                  ...common,
                  id: `${order.id}-${itemIndex}-stack-${start}`,
                  width,
                  depth,
                  height: stackHeight,
                  effectiveWidth: width,
                  effectiveDepth: depth,
                  unitCount: stackCount,
                  loadingMode: stackCount > 1 ? "stacked" : "horizontal",
                });
              }
              return stacks;
            }
          }

          return Array.from({ length: quantity }, (_, unitIndex) => ({
            ...common,
            id: `${order.id}-${itemIndex}-${unitIndex}`,
            width,
            depth,
            height,
            effectiveWidth: width + spacing,
            effectiveDepth: depth + spacing,
            unitCount: 1,
            loadingMode: "horizontal" as const,
          }));
        }),
      );
  }, [dimensions, orders, selectedSlot, settings?.glaze_spacing_cm]);

  const plan = useMemo(
    () =>
      createKilnPlan({
        pieces,
        ...dimensions,
      }),
    [dimensions, pieces],
  );

  const activeOrders = useMemo(
    () =>
      orders.filter((order) => order.slot_id === selectedSlot?.id && order.status !== "cancelled"),
    [orders, selectedSlot?.id],
  );

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <Box className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">Crie uma vaga para montar a fornada</p>
            <p className="text-sm text-muted-foreground">
              A visualização 3D usa as peças reservadas em uma vaga de queima.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 border-b bg-muted/20 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers3 className="h-5 w-5 text-primary" /> Montagem 3D da fornada
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Distribuição automática conservadora baseada nas dimensões cadastradas.
            </p>
          </div>
          <div className="w-full space-y-1.5 sm:w-[360px]">
            <Label>Vaga de queima</Label>
            <Select
              value={effectiveSlotId}
              onValueChange={(value) => {
                setSelectedSlotId(value);
                setSelectedShelf(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.id}>
                    {slot.title} · {formatDate(slot.firing_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Pedidos ativos</p>
              <p className="mt-1 text-xl font-semibold">{activeOrders.length}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Peças planejadas</p>
              <p className="mt-1 text-xl font-semibold">
                {plan.totalPieces - plan.overflowPieceCount}/{plan.totalPieces}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Andares montados</p>
              <p className="mt-1 text-xl font-semibold">{plan.shelves.length}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Suportes utilizados</p>
              <p className="mt-1 text-xl font-semibold">{plan.supportsUsed}</p>
              <p className="text-xs text-muted-foreground">{plan.supportSetsUsed} conjunto(s)</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Ocupação das bases</p>
              <p className="mt-1 text-xl font-semibold">{plan.occupiedPercent.toFixed(0)}%</p>
            </div>
          </div>

          {plan.overflowPieceCount > 0 && (
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {plan.overflowPieceCount} peça(s) não couberam na montagem conservadora
                </p>
                <p className="text-sm">
                  Revise as dimensões, a quantidade de suportes ou divida os pedidos em outra queima
                  antes de confirmar com o cliente.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
            <div className="overflow-hidden rounded-2xl border bg-[#f8f2e6]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/70 px-4 py-3">
                <div>
                  <p className="font-semibold">Vista interativa</p>
                  <p className="text-xs text-muted-foreground">
                    Passe o cursor sobre uma peça para ver seus dados.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRotation(-18);
                    setSelectedShelf(null);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Restaurar vista
                </Button>
              </div>
              <KilnDiagram
                plan={plan}
                internalHeight={dimensions.internalHeight}
                shelfThickness={dimensions.shelfThickness}
                rotation={rotation}
                selectedShelf={selectedShelf}
              />
              <div className="border-t bg-white/75 px-4 py-3">
                <Label htmlFor="kiln-rotation">Girar visualização</Label>
                <input
                  id="kiln-rotation"
                  type="range"
                  min="-70"
                  max="35"
                  step="1"
                  value={rotation}
                  onChange={(event) => setRotation(Number(event.target.value))}
                  className="mt-2 w-full accent-primary"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Configuração utilizada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Diâmetro útil</span>
                    <span className="font-medium">
                      {plan.usableDiameter.toLocaleString("pt-BR")} cm
                    </span>
                  </div>
                  {selectedSlot?.firing_type === "biscuit" && (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Peça baixa na vertical</span>
                        <span className="text-right font-medium">
                          até {dimensions.biscuitVerticalMaxHeight.toLocaleString("pt-BR")} cm
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Máximo por pilha</span>
                        <span className="font-medium">
                          {dimensions.biscuitStackMaxPieces} peças
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Altura interna</span>
                    <span className="font-medium">
                      {dimensions.internalHeight.toLocaleString("pt-BR")} cm
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Espessura da prateleira</span>
                    <span className="font-medium">
                      {dimensions.shelfThickness.toLocaleString("pt-BR")} cm
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Tipo</span>
                    <Badge variant="secondary">
                      {selectedSlot?.firing_type === "glaze" ? "Esmalte" : "Biscoito"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo por andar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {plan.shelves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma peça ativa cadastrada nesta vaga.
                    </p>
                  ) : (
                    plan.shelves.map((shelf, index) => (
                      <button
                        key={`summary-${index}`}
                        type="button"
                        onClick={() => setSelectedShelf(selectedShelf === index ? null : index)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedShelf === index
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/40 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Andar {index + 1}</span>
                          <Badge variant="outline">
                            {physicalPieceCount(shelf.placements)} peça(s)
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Altura máxima: {shelf.maxHeight.toLocaleString("pt-BR")} cm
                          {shelf.supportSetsAbove.length > 0
                            ? ` · Próximo nível: ${shelf.supportSetsAbove
                                .map((support) => support.height.toLocaleString("pt-BR"))
                                .join(" + ")} cm`
                            : " · Último nível"}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="rounded-xl border bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground">
                A montagem é uma estimativa conservadora. No esmalte, cada peça recebe a margem
                configurada. No biscoito, peças baixas são posicionadas na vertical e bowls, canecas
                e outros nomes configurados formam pilhas limitadas. Peças não reconhecidas
                permanecem individuais. Confirme a disposição física antes de iniciar a queima.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
