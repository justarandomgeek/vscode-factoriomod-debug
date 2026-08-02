import { BufferStream } from '../Util/BufferStream';
import { MapVersion } from '../Util/MapVersion';

type Enum<T extends object> = T[keyof T];
function getEnumName<T extends object>(value:Enum<T>, enumobj: T): keyof T | undefined {
	return (Object.keys(enumobj) as (keyof T)[]).find(
		(key)=>enumobj[key] === value
	);
}

export const SavedLuaTypeTag = {
	Nil: 0,
	BoolFalse: 1,
	BoolTrue: 2,
	Number: 3,
	String: 4,
	Table: 5,
	ExistingGCObject: 6,
	LuaObject: 7,
	TableWithMeta: 8,
} as const;
export type SavedLuaTypeTag = Enum<typeof SavedLuaTypeTag>;

export type SavedLuaTableValues = {
	key:SavedLuaValue
	value:SavedLuaValue
}[];

export interface SavedLuaNumber {
	type: "Number"
	value: number
	size: 9
}

export interface SavedLuaString {
	type: "String"
	value: string
	size: number // size in saved stream (including type+length)
}

export interface SavedLuaTable {
	type: "Table"|"TableWithMeta"
	id: number
	values: SavedLuaTableValues
	size: number
}

export interface SavedLuaTableWithMeta extends SavedLuaTable {
	type: "TableWithMeta"
	meta: string
}

export interface SavedLuaRef {
	type: "ExistingGCObject"
	id: number
	size: number
}

export interface LuaObjectData {
	type: keyof typeof LuaObjectType
	size: number
	[moreProps:string]:unknown
}
export interface SavedLuaObject {
	type: "LuaObject"
	id: number
	value: LuaObjectData
	size: number
}

export type SavedLuaValue = { type: "Nil"|"BoolFalse"|"BoolTrue"; size:1 }|
	SavedLuaNumber|SavedLuaString|SavedLuaTable|SavedLuaRef|SavedLuaObject;

export const LuaObjectType = {
	LuaEntity: 0,
	LuaInvalidObject: 1,
	LuaRecipe: 2,
	LuaTechnology: 3,
	LuaRandomGenerator: 4,
	LuaForce: 5,
	LuaBurner: 6,
	LuaLogisticPoint: 7,
	LuaDecorativePrototype: 8,
	LuaCustomChartTag: 9,
	LuaPermissionGroups: 10,
	LuaPermissionGroup: 11,
	LuaUnitGroup: 12,
	LuaTrain: 13,
	LuaFluidBox: 14,
	LuaEntityPrototype: 15,
	LuaItemPrototype: 16,
	LuaEquipmentGrid: 18,
	LuaEquipment: 19,
	LuaItemStack: 20,
	LuaPlayer: 21,
	LuaGui: 22,
	LuaGuiElement: 23,
	LuaStyle: 24,
	LuaSurface: 25,
	LuaFluidPrototype: 26,
	LuaGroup: 27,
	LuaTile: 28, // LuaTileSurface internally. LuaTile=17 is ancient history.
	LuaChunkIterator: 29,
	LuaStructMapSettings: 30,
	LuaTransportLine: 31,
	LuaLogisticNetwork: 32,
	LuaLogisticCell: 33,
	LuaInventory: 34,
	LuaControlBehavior: 35,
	LuaFlowStatistics: 36,
	LuaTilePrototype: 37,
	LuaEquipmentPrototype: 38,
	LuaCircuitNetwork: 39,
	LuaDamagePrototype: 40,
	LuaVirtualSignalPrototype: 41,
	LuaEquipmentGridPrototype: 42,
	LuaRecipePrototype: 43,
	LuaTechnologyPrototype: 44,
	LuaBurnerPrototype: 45,
	LuaElectricEnergySourcePrototype: 46,
	LuaCustomInputPrototype: 47,
	LuaNoiseLayerPrototype: 48, // Deprecated. May only appear if input.mapVersion < MapVersion(1, 2, 0, 298)
	LuaAutoplaceControlPrototype: 49,
	LuaModSettingPrototype: 50,
	LuaAmmoCategoryPrototype: 51,
	LuaRailPath: 52,
	LuaFluidBoxPrototype: 53,
	LuaAISettings: 54,
	LuaProfiler: 55,
	LuaNamedNoiseExpression: 56,
	LuaFuelCategoryPrototype: 57,
	LuaResourceCategoryPrototype: 58,
	LuaAchievementPrototype: 59,
	LuaModuleCategoryPrototype: 60,
	LuaEquipmentCategoryPrototype: 61,
	LuaTrivialSmokePrototype: 62,
	LuaShortcutPrototype: 63,
	LuaRecipeCategoryPrototype: 64,
	LuaParticlePrototype: 65,
	LuaFluidEnergySourcePrototype: 66,
	LuaHeatEnergySourcePrototype: 67,
	LuaVoidEnergySourcePrototype: 68,
	LuaFontPrototype: 69,
	LuaQualityPrototype: 70,
	LuaSpaceLocationPrototype: 71,
	LuaPlanet: 72,
	LuaUndoRedoStack: 73,
	LuaSurfacePropertyPrototype: 74,
	LuaCustomEventPrototype: 75,
	LuaSpaceConnectionPrototype: 76,
	LuaActiveTriggerPrototype: 77,
	LuaSpacePlatform: 78,
	LuaHeatBufferPrototype: 79,
	LuaWireConnector: 80,
	LuaAsteroidChunkPrototype: 81,
	LuaLogisticSection: 82,
	LuaRailEnd: 83,
	LuaNamedNoiseFunction: 84,
	LuaCollisionLayerPrototype: 85,
	LuaSimulation: 86,
	LuaAirbornePollutionPrototype: 87,
	LuaItem: 88,
	LuaTrainManager: 89,
	LuaRenderObject: 90,
	LuaRecord: 91,
	LuaBurnerUsagePrototype: 92,
	LuaSurfacePrototype: 93,
	LuaProcessionPrototype: 94,
	LuaProcessionLayerInheritanceGroupPrototype: 95,
	LuaLogisticSections: 96,
	LuaCargoHatch: 97,
	LuaSchedule: 98,
	LuaTerritory: 99,
	LuaSegmentedUnit: 100,
	LuaSegment: 101,
	LuaModData: 104,

	// this one isn't real, just so TS understands that there might be more not covered...
	xLuaFutureObject: -1,
} as const;
export type LuaObjectType = Enum<typeof LuaObjectType>;

export const LuaItemStackType = {
	None: 0,
	EntityInventory: 1,
	ControllerInventory: 2,
	ItemEntity: 3, // Only used before MapVersion(1, 2, 0, 361), then migrated to Entity
	EntityCursorStack: 4, // Only used before MapVersion(1, 2, 0, 361), then migrated to Entity
	ControllerCursorStack: 5, // Only used before MapVersion(1, 2, 0, 361), then migrated to Entity
	Inserter: 6, // Only used before MapVersion(1, 2, 0, 361), then migrated to Entity
	ItemWithInventory: 7,
	BeltConnectable: 8,
	Equipment: 9,
	TargetableInventory: 10,
	TargetableItemStack: 11,
	PlayerBlueprint: 12,
	ScriptInventory: 13,
	LinkedInventory: 14,
} as const;
export type LuaItemStackType = Enum<typeof LuaItemStackType>;

export const LuaControlBehaviorType = {
	Container: 1,
	GenericOnOff: 2,
	Inserter: 3,
	Lamp: 4,
	LogisticContainer: 5,
	Roboport: 6,
	StorageTank: 7,
	TrainStop: 8,
	DeciderCombinator: 9,
	ArithmeticCombinator: 10,
	ConstantCombinator: 11,
	TransportBelt: 12,
	Accumulator: 13,
	RailSignal: 14,
	Wall: 15,
	MiningDrill: 16,
	ProgrammableSpeaker: 17,
	RailChainSignal: 18,
	AssemblingMachine: 19,
	SelectorCombinator: 20,
	Pump: 21,
	RocketSilo: 22,
	Turret: 23,
	Reactor: 24,
	SpacePlatformHub: 25,
	ArtilleryTurret: 26,
	Radar: 27,
	AsteroidCollector: 28,
	DisplayPanel: 29,
	Loader: 30,
	CargoLandingPad: 31,
	AgriculturalTower: 32,
	Furnace: 33,
	ProxyContainer: 34,
} as const;
export type LuaControlBehaviorType = Enum<typeof LuaControlBehaviorType>;

export const LuaFlowStatisticsType = {
	ItemProduction: 1,
	FluidProduction: 2,
	KillCount: 3,
	EntityBuild: 6,
	ElectricNetwork: 7,
	Pollution: 8,
} as const;
export type LuaFlowStatisticsType = Enum<typeof LuaFlowStatisticsType>;

export class ScriptDat {
	readonly version: MapVersion;
	readonly data: {
		[modname:string]:SavedLuaValue
	};

	private gcid = 0;
	private gcidmap: SavedLuaTable[] = [];
	private gcidmaps: {
		[modname:string]:SavedLuaTable[]
	};

	constructor(b:BufferStream) {
		this.version = MapVersion.load(b.read(9));
		this.data = {};
		this.gcidmaps = {};
		const modcount = b.readUInt32LE();
		for (let i = 0; i < modcount; i++) {
			const namesize = b.readPackedUInt_8_32();
			const name = b.readString(namesize);
			const datasize = b.readPackedUInt_8_32();
			// the inner blob is a separate stream because it used to be a serpent string
			// this won't load anything that old.
			const inner = new BufferStream(b.read(datasize));
			// load and discard another mapversion...
			MapVersion.load(inner.read(9));
			// and they have separate runs of gcid
			this.gcid = 0;
			this.gcidmap = [];
			const data = this.loadLuaValue(inner);
			if (inner.readableLength > 0) {
				throw new Error(`Data for ${name} not fully consumed, ${inner.readableLength} bytes left`);
			}
			// and discard bool hadcontrol (always true?)
			b.readUInt8();
			this.data[name] = data;
			this.gcidmaps[name] = this.gcidmap;
		}
	}

	find(modname:string, id:number) {
		return this.gcidmaps[modname][id];
	}

	private loadLuaValue(b:BufferStream):SavedLuaValue {
		const typetag = b.readUInt8() as SavedLuaTypeTag;
		const type = getEnumName(typetag, SavedLuaTypeTag);
		switch (type) {
			case "Nil":
			case "BoolFalse":
			case "BoolTrue":
				return { type, size: 1 };
			case "Number": {
				const value = b.readDoubleLE();
				return { type, value, size: 9 };
			}
			case "String": {
				const slen = b.readPackedUInt_8_32();
				const value = b.readString(slen);
				return { type, value, size: 1 + 1 + (slen >= 0xff ? 4 : 0) + slen };
			}
			case "TableWithMeta":
			case "Table": {
				const thisgcid = this.gcid++;
				let metaname:string|undefined;
				let size = 1; // start with type tag...
				if (type === "TableWithMeta") {
					const metanamelen = b.readPackedUInt_8_32();
					metaname = b.readString(metanamelen);
					size += 1 + (metanamelen >= 0xff ? 4 : 0) + metanamelen;
				}
				const count = b.readPackedUInt_8_32();
				size += count>=0xff?5:1;
				const values = [];
				for (let i = 0; i < count; i++) {
					const key = this.loadLuaValue(b);
					const value = this.loadLuaValue(b);
					values.push({key, value});
					size += key.size + value.size;
				}

				const t = {
					type,
					id: thisgcid,
					values,
					meta: metaname,
					size,
				};
				this.gcidmap[thisgcid] = t;
				return t;
			}
			case "ExistingGCObject":
				const id = b.readPackedUInt_16_32();
				return { type, id, size: 1 + 2 + (id >= 0xffff ? 4 : 0) };
			case "LuaObject": {
				const type = "LuaObject";
				const thisgcid = this.gcid++;
				const ltype = b.readUInt32LE() as LuaObjectType;
				const ltypename = getEnumName(ltype, LuaObjectType);
				const data = Object.assign(
					{type: ltypename},
					this.loadLuaObjectData(ltype, b)
				) as LuaObjectData;
				return { type, id: thisgcid, value: data, size: 1+4+data.size};
			}
			default:
				throw new Error(`Invalid type ${typetag} in saved lua value`);
		}
	}

	private loadLuaObjectData(ltype:LuaObjectType, b:BufferStream):Omit<LuaObjectData, "type"> {
		switch (ltype) {
			case LuaObjectType.LuaEntity:
			case LuaObjectType.LuaPermissionGroup:
			case LuaObjectType.LuaUnitGroup:
			case LuaObjectType.LuaTrain:
			case LuaObjectType.LuaFluidBox:
			case LuaObjectType.LuaEquipmentGrid:
			case LuaObjectType.LuaEquipment:
			case LuaObjectType.LuaPlayer:
			case LuaObjectType.LuaGui:
			case LuaObjectType.LuaLogisticNetwork:
			case LuaObjectType.LuaLogisticCell:
			case LuaObjectType.LuaRailPath:
			case LuaObjectType.LuaAISettings:
			case LuaObjectType.LuaPlanet:
			case LuaObjectType.LuaRenderObject:
			case LuaObjectType.LuaUndoRedoStack:
			case LuaObjectType.LuaSpacePlatform:
			case LuaObjectType.LuaItem:
			case LuaObjectType.LuaCargoHatch:
			case LuaObjectType.LuaSchedule:
			case LuaObjectType.LuaTerritory:
			case LuaObjectType.LuaSegmentedUnit:
			{
				const target = b.readUInt32LE();
				return { target, size: 4 };
			}
			case LuaObjectType.LuaPermissionGroups:
			case LuaObjectType.LuaTrainManager:
				return { size: 0 };
			case LuaObjectType.LuaRecipe:
			case LuaObjectType.LuaTechnology:
			{
				const force = b.readUInt8();
				const id = b.readUInt16LE();
				return { force, id, size: 3 };
			}
			case LuaObjectType.LuaRandomGenerator:
			{
				const seed = [b.readUInt32LE(), b.readUInt32LE(), b.readUInt32LE() ];
				return { seed, size: 4*3 };
			}
			case LuaObjectType.LuaBurner:
			{
				const entity = b.readUInt32LE();
				const equipment = b.readUInt32LE();
				return { entity, equipment, size: 4*2 };
			}
			case LuaObjectType.LuaLogisticPoint:
			{
				const index = b.readUInt8();
				const owner = b.readUInt32LE();
				return { index, owner, size: 1+4 };
			}
			case LuaObjectType.LuaCustomChartTag:
			{
				const force = b.readUInt8();
				let size = 1;
				let surface;
				if (!this.version.isBeyond(1, 2, 0, 259)) {
					surface = b.readPackedUInt_8_32();
					size += surface>=0xff?5:1;
				}
				const target = b.readUInt32LE();
				size += 4;
				return { force, surface, target, size };
			}

			case LuaObjectType.LuaDecorativePrototype:
			{
				if (this.version.isBeyond(1, 2, 1, 4)) {
					const id = b.readUInt16LE();
					return { id, size: 2 };
				} else {
					const id = b.readUInt8();
					return { id, size: 1 };
				}
			}
			case LuaObjectType.LuaTilePrototype:
			{
				if (this.version.isBeyond(1, 2, 0, 3)) {
					const id = b.readUInt16LE();
					return { id, size: 2 };
				} else {
					const id = b.readUInt8();
					return { id, size: 1 };
				}
			}
			case LuaObjectType.LuaForce:
			case LuaObjectType.LuaDamagePrototype:
			case LuaObjectType.LuaEquipmentGridPrototype:
			case LuaObjectType.LuaAutoplaceControlPrototype:
			case LuaObjectType.LuaAmmoCategoryPrototype:
			case LuaObjectType.LuaFuelCategoryPrototype:
			case LuaObjectType.LuaResourceCategoryPrototype:
			case LuaObjectType.LuaModuleCategoryPrototype:
			case LuaObjectType.LuaEquipmentCategoryPrototype:
			case LuaObjectType.LuaTrivialSmokePrototype:
			case LuaObjectType.LuaQualityPrototype:
			case LuaObjectType.LuaProcessionLayerInheritanceGroupPrototype:
			{
				const id = b.readUInt8();
				return { id, size: 1 };
			}
			case LuaObjectType.LuaEntityPrototype:
			case LuaObjectType.LuaItemPrototype:
			case LuaObjectType.LuaFluidPrototype:
			case LuaObjectType.LuaEquipmentPrototype:
			case LuaObjectType.LuaVirtualSignalPrototype:
			case LuaObjectType.LuaRecipePrototype:
			case LuaObjectType.LuaTechnologyPrototype:
			case LuaObjectType.LuaCustomInputPrototype:
			case LuaObjectType.LuaNoiseLayerPrototype:
			case LuaObjectType.LuaModSettingPrototype:
			case LuaObjectType.LuaAchievementPrototype:
			case LuaObjectType.LuaShortcutPrototype:
			case LuaObjectType.LuaRecipeCategoryPrototype:
			case LuaObjectType.LuaParticlePrototype:
			case LuaObjectType.LuaFluidEnergySourcePrototype:
			case LuaObjectType.LuaHeatEnergySourcePrototype:
			case LuaObjectType.LuaVoidEnergySourcePrototype:
			case LuaObjectType.LuaHeatBufferPrototype:
			case LuaObjectType.LuaSpaceLocationPrototype:
			case LuaObjectType.LuaSurfacePropertyPrototype:
			case LuaObjectType.LuaCustomEventPrototype:
			case LuaObjectType.LuaSpaceConnectionPrototype:
			case LuaObjectType.LuaActiveTriggerPrototype:
			case LuaObjectType.LuaAsteroidChunkPrototype:
			case LuaObjectType.LuaCollisionLayerPrototype:
			case LuaObjectType.LuaAirbornePollutionPrototype:
			case LuaObjectType.LuaBurnerUsagePrototype:
			case LuaObjectType.LuaSurfacePrototype:
			case LuaObjectType.LuaProcessionPrototype:
			{
				const id = b.readUInt16LE();
				return { id, size: 2 };
			}
			case LuaObjectType.LuaNamedNoiseExpression:
			case LuaObjectType.LuaNamedNoiseFunction:
			case LuaObjectType.LuaModData:
			{
				const id = b.readUInt32LE();
				return { id, size: 4 };
			}
			case LuaObjectType.LuaTile:
			{
				const position = {
					x: b.readInt32LE(),
					y: b.readInt32LE(),
				};
				const surface = b.readPackedUInt_8_32();
				return { position, surface, size: 8 + (surface>=0xff?5:1) };
			}
			case LuaObjectType.LuaGuiElement:
			{
				if (this.version.isBeyond(1, 2, 0, 415)) {
					const id = b.readUInt32LE();
					return { id, size: 4 };
				} else {
					const player = b.readUInt32LE();
					const index = b.readUInt32LE();
					return { player, index, size: 8 };
				}
			}
			case LuaObjectType.LuaStyle:
			{
				const player = b.readUInt32LE();
				const index = b.readUInt32LE();
				return { player, index, size: 8 };
			}
			case LuaObjectType.LuaSurface:
			{
				if (this.version.isBeyond(1, 2, 7, 1)) {
					const target = b.readUInt32LE();
					return { target, size: 4 };
				} else {
					const surface = b.readPackedUInt_8_32();
					return { surface, size: surface>=0xff?5:1 };
				}
			}
			case LuaObjectType.LuaGroup:
			{
				const group = b.readUInt8();
				const subgroup = b.readUInt16LE();
				return { group, subgroup, size: 3 };
			}
			case LuaObjectType.LuaChunkIterator:
			{
				const surface = b.readPackedUInt_8_32();
				const position = {
					x: b.readInt32LE(),
					y: b.readInt32LE(),
				};
				return { surface, position, size: (surface>=0xff?5:1) + 8 };
			}
			case LuaObjectType.LuaTransportLine:
			{
				const target = b.readUInt32LE();
				const index = b.readUInt8();
				return { target, index, size: 4+1 };
			}
			case LuaObjectType.LuaInventory:
			{
				const entity = b.readUInt32LE();
				const controller = b.readUInt32LE();
				const item = b.readUInt32LE();
				const equipment = b.readUInt32LE();
				const scriptinv = b.readUInt32LE();
				const linked = b.readUInt8() !== 0;
				let size = 4*5 + 1;
				let link;
				if (linked) {
					const force = b.readUInt8();
					const proto = b.readUInt16LE();
					const linkid = b.readUInt32LE();
					link = {force, proto, linkid};
					size += 1+2+4;
				}
				const index = b.readUInt8();
				size += 1;
				return { entity, controller, item, equipment, scriptinv, link, index, size };
			}
			case LuaObjectType.LuaBurnerPrototype:
			case LuaObjectType.LuaElectricEnergySourcePrototype:
			{
				const entity = b.readUInt16LE();
				const equipment = b.readUInt16LE();
				return { entity, equipment, size: 2*2 };
			}
			case LuaObjectType.LuaFluidBoxPrototype:
			{
				const entity = b.readUInt16LE();
				const index = b.readUInt32LE();
				const targettype = b.readUInt8();
				return { entity, index, targettype, size: 2+4+1 };
			}
			case LuaObjectType.LuaProfiler:
			{
				const stopped = b.readUInt8() !== 0;
				return { stopped, size: 1 };
			}
			case LuaObjectType.LuaFontPrototype:
			{
				const hasname = b.readUInt8()!==0;
				let size = 1;
				let name;
				if (hasname) {
					const slen = b.readPackedUInt_8_32();
					name = b.readString(slen);
					size += (slen>=0xff?5:1) + slen;
				}
				return { name, size };
			}

			case LuaObjectType.LuaCircuitNetwork:
			{
				const target = b.readUInt32LE();
				let size = 4;
				let connector;
				let wire;
				if (this.version.isBeyond(1, 2, 0, 155)) {
					wire = b.readUInt8();
					size += 1;
				} else {
					connector = b.readUInt8();
					wire = b.readUInt8();
					size += 2;
				}
				return { target, connector, wire, size };
			}

			case LuaObjectType.LuaWireConnector:
			{
				const target = b.readUInt32LE();
				const connector = b.readUInt8();
				return { target, connector, size: 4+1 };
			}

			case LuaObjectType.LuaRailEnd:
			{
				const target = b.readUInt32LE();
				const direction = b.readUInt8();
				return { target, direction, size: 4+1 };
			}

			case LuaObjectType.LuaRecord:
			{
				const player = b.readUInt16LE();
				const id = b.readUInt32LE();
				return { player, id, size: 2+4 };
			}

			case LuaObjectType.LuaLogisticSections:
			{
				const target = b.readUInt32LE();
				const member = b.readUInt8();
				return { target, member, size: 4+1 };
			}

			case LuaObjectType.LuaSegment:
			{
				const target = b.readUInt32LE();
				const index = b.readUInt32LE();
				return { target, index, size: 4*2 };
			}

			case LuaObjectType.LuaItemStack:
				return this.loadLuaItemStack(b);
			case LuaObjectType.LuaControlBehavior:
				return this.loadLuaControlBehavior(b);
			case LuaObjectType.LuaFlowStatistics:
				return this.loadLuaFlowStatistics(b);
			case LuaObjectType.LuaLogisticSection:
				return this.loadLuaLogisticSection(b);

			case LuaObjectType.LuaStructMapSettings:
			case LuaObjectType.LuaSimulation:
				throw new Error(`LuaObject of type ${ltype} cannot have been saved`);

			default:
				throw new Error(`Unknown LuaObject type ${ltype}`);
		}
	}

	private loadItemStackLocation(b:BufferStream) {
		const standaloneStack = this.version.isBeyond(1, 2, 0, 33) ? b.readUInt8() : 0;
		if (standaloneStack!==0) { return { standaloneStack, size: 1 }; }

		const inventoryIndex = b.readUInt8();
		const slotIndex = b.readUInt16LE();
		return { inventoryIndex, slotIndex, size: (this.version.isBeyond(1, 2, 0, 33)?1:0)+1+2 };
	}

	private loadLuaItemStack(b:BufferStream) {

		const type = (this.version.isBeyond(1, 2, 0, 359) ? b.readUInt8() : b.readUInt32LE()) as LuaItemStackType;
		let size = this.version.isBeyond(1, 2, 0, 359) ? 1 : 4;
		switch (type) {
			case LuaItemStackType.None:
				return { stacktype: getEnumName(type, LuaItemStackType), size };
			case LuaItemStackType.EntityInventory:
			case LuaItemStackType.ControllerInventory:
			case LuaItemStackType.ItemWithInventory:
			case LuaItemStackType.Equipment:
			{
				const target = b.readUInt32LE();
				size += 4;
				let location;
				if (this.version.isBeyond(1, 2, 0, 361)) {
					location = this.loadItemStackLocation(b);
					size += location.size;
				} else {
					const inventoryIndex = b.readUInt8();
					const slotIndex = b.readUInt16LE();
					location = { inventoryIndex, slotIndex };
					size += 1+2;
				}
				return { stacktype: getEnumName(type, LuaItemStackType), target, location, size};
			}
			case LuaItemStackType.ItemEntity:
			case LuaItemStackType.EntityCursorStack:
			case LuaItemStackType.ControllerCursorStack:
			case LuaItemStackType.Inserter:
			case LuaItemStackType.PlayerBlueprint:
			{
				const target = b.readUInt32LE();
				size += 4;
				return { stacktype: getEnumName(type, LuaItemStackType), target, size};
			}
			case LuaItemStackType.BeltConnectable:
			{
				const target = b.readUInt32LE();
				const line = b.readUInt8();
				size += 4+1;
				let item;
				let itemid;
				if (this.version.isBeyond(1, 2, 0, 361)) {
					item = b.readUInt16LE();
					itemid = b.readUInt32LE();
					size += 2+4;
				} else {
					item = b.readUInt8();
					size += 1;
				}
				return { stacktype: getEnumName(type, LuaItemStackType), target, line, item, itemid, size};
			}
			case LuaItemStackType.TargetableInventory:
				throw new Error(`LuaItemStack type ${type} cannot have been saved`);

			case LuaItemStackType.TargetableItemStack:
				return { stacktype: getEnumName(type, LuaItemStackType), size };
			case LuaItemStackType.ScriptInventory:
			{
				const target = b.readUInt32LE();
				const slot = b.readUInt16LE();
				size += 4+2;
				return { stacktype: getEnumName(type, LuaItemStackType), target, slot, size};
			}
			case LuaItemStackType.LinkedInventory:
			{
				const force = b.readUInt8();
				const proto = b.readUInt16LE();
				const linkid = b.readUInt32LE();
				size += 1+2+4;
				return { stacktype: getEnumName(type, LuaItemStackType), force, proto, linkid, size};
			}

			default:
				throw new Error(`Unknown LuaItemStack type ${type}`);

		}
	}

	private loadLuaControlBehavior(b:BufferStream) {
		const type = b.readUInt32LE() as LuaControlBehaviorType;
		const target = b.readUInt32LE();
		return {behavior: getEnumName(type, LuaControlBehaviorType), target, size: 4*2};
	}

	private loadLuaFlowStatistics(b:BufferStream) {
		const type = b.readUInt32LE() as LuaFlowStatisticsType;
		let size = 4;

		switch (type) {
			case LuaFlowStatisticsType.ItemProduction:
			case LuaFlowStatisticsType.FluidProduction:
			case LuaFlowStatisticsType.KillCount:
			case LuaFlowStatisticsType.EntityBuild:
			{
				let surface;
				if (this.version.isBeyond(1, 2, 0, 360)) {
					surface = b.readPackedUInt_8_32();
					size += surface>=0xff?5:1;
				}
				const force = b.readUInt8();
				size += 1;
				return {flow: getEnumName(type, LuaFlowStatisticsType), force, surface, size};
			}
			case LuaFlowStatisticsType.ElectricNetwork:
			{
				const target = b.readUInt32LE();
				size += 4;
				let surface;
				if (this.version.isBeyond(2, 0, 48, 4)) {
					surface = b.readPackedUInt_8_32();
					size += surface>=0xff?5:1;
				}
				return {flow: getEnumName(type, LuaFlowStatisticsType), target, surface, size};
			}
			case LuaFlowStatisticsType.Pollution:
			{
				let surface;
				if (this.version.isBeyond(1, 2, 0, 360)) {
					surface = b.readPackedUInt_8_32();
					size += surface>=0xff?5:1;
				}
				return {flow: getEnumName(type, LuaFlowStatisticsType), surface, size };
			}
			default:
				throw new Error(`Unknown LuaFlowStatistics type ${type}`);
		}
	}

	private loadLuaLogisticSection(b:BufferStream) {
		let size = 0;
		if (!this.version.isBeyond(1, 2, 31, 1)) {
			b.readUInt8(); // game just discards, old member index?
			size += 1;
		}
		let section;
		if (!this.version.isBeyond(1, 2, 0, 265)) {
			b.readUInt8(); // game just discards, old section index?
			size += 1;
		} else {
			section = b.readUInt32LE();
			size += 4;
		}
		const entity = b.readUInt32LE();
		size += 4;
		return { entity, section, size };
	}
}

