import { BufferStream } from "../Util/BufferStream";
import { MapVersion } from "../Util/MapVersion";

export enum SavedLuaTypeTag {
	Nil = 0,
	BoolFalse = 1,
	BoolTrue = 2,
	Number = 3,
	String = 4,
	Table = 5,
	ExistingGCObject = 6,
	LuaObject = 7,
	TableWithMeta = 8,
};

export type SavedLuaTableValues = {
	key:SavedLuaValue
	value:SavedLuaValue
}[];

export interface SavedLuaNumber {
	type: "Number"
	value: number
}

export interface SavedLuaString {
	type: "String"
	value: string
}

export interface SavedLuaTable {
	type: "Table"|"TableWithMeta"
	id: number
	values: SavedLuaTableValues
}

export interface SavedLuaTableWithMeta extends SavedLuaTable {
	type: "TableWithMeta"
	meta: string
}

export interface SavedLuaRef {
	type: "ExistingGCObject"
	id: number
}

export interface LuaObjectData {
	type: keyof typeof LuaObjectType
}
export interface SavedLuaObject {
	type: "LuaObject"
	id: number
	value: LuaObjectData
}

export type SavedLuaValue = { type: "Nil"|"BoolFalse"|"BoolTrue" }|
	SavedLuaNumber|SavedLuaString|SavedLuaTable|SavedLuaRef|SavedLuaObject;

export enum LuaObjectType {
	LuaEntity = 0,
	LuaRecipe = 2,
	LuaTechnology = 3,
	LuaRandomGenerator = 4,
	LuaForce = 5,
	LuaBurner = 6,
	LuaLogisticPoint = 7,
	LuaDecorativePrototype = 8,
	LuaCustomChartTag = 9,
	LuaPermissionGroups = 10,
	LuaPermissionGroup = 11,
	LuaUnitGroup = 12,
	LuaTrain = 13,
	LuaFluidBox = 14,
	LuaEntityPrototype = 15,
	LuaItemPrototype = 16,
	LuaEquipmentGrid = 18,
	LuaEquipment = 19,
	LuaItemStack = 20,
	LuaPlayer = 21,
	LuaGui = 22,
	LuaGuiElement = 23,
	LuaStyle = 24,
	LuaSurface = 25,
	LuaFluidPrototype = 26,
	LuaGroup = 27,
	LuaTile = 28, // LuaTileSurface internally. LuaTile=17 is ancient history.
	LuaChunkIterator = 29,
	LuaStructMapSettings = 30,
	LuaTransportLine = 31,
	LuaLogisticNetwork = 32,
	LuaLogisticCell = 33,
	LuaInventory = 34,
	LuaControlBehavior = 35,
	LuaFlowStatistics = 36,
	LuaTilePrototype = 37,
	LuaEquipmentPrototype = 38,
	LuaCircuitNetwork = 39,
	LuaDamagePrototype = 40,
	LuaVirtualSignalPrototype = 41,
	LuaEquipmentGridPrototype = 42,
	LuaRecipePrototype = 43,
	LuaTechnologyPrototype = 44,
	LuaBurnerPrototype = 45,
	LuaElectricEnergySourcePrototype = 46,
	LuaCustomInputPrototype = 47,
	LuaNoiseLayerPrototype = 48,
	LuaAutoplaceControlPrototype = 49,
	LuaModSettingPrototype = 50,
	LuaAmmoCategoryPrototype = 51,
	LuaRailPath = 52,
	LuaFluidBoxPrototype = 53,
	LuaAISettings = 54,
	LuaProfiler = 55,
	LuaNamedNoiseExpression = 56,
	LuaFuelCategoryPrototype = 57,
	LuaResourceCategoryPrototype = 58,
	LuaAchievementPrototype = 59,
	LuaModuleCategoryPrototype = 60,
	LuaEquipmentCategoryPrototype = 61,
	LuaTrivialSmokePrototype = 62,
	LuaShortcutPrototype = 63,
	LuaRecipeCategoryPrototype = 64,
	LuaParticlePrototype = 65,
	LuaFluidEnergySourcePrototype = 66,
	LuaHeatEnergySourcePrototype = 67,
	LuaVoidEnergySourcePrototype = 68,
	LuaFontPrototype = 69,
	LuaHeatBufferPrototype = 79,

	// this one isn't real, just so TS understands that there might be more not covered...
	xLuaFutureObject = -1
}

export enum LuaItemStackType {
	None = 0,
	EntityInventory = 1,
	ControllerInventory = 2,
	ItemEntity = 3,
	EntityCursorStack = 4,
	ControllerCursorStack = 5,
	Inserter = 6,
	ItemWithInventory = 7,
	BeltConnectable = 8,
	Equipment = 9,
	TargetableInventory = 10,
	TargetableItemStack = 11,
	PlayerBlueprint = 12,
	ScriptInventory = 13,
	LinkedInventory = 14,
}

export enum LuaControlBehaviorType {
	Container = 1,
	GenericOnOff = 2,
	Inserter = 3,
	Lamp = 4,
	LogisticContainer = 5,
	Roboport = 6,
	StorageTank = 7,
	TrainStop = 8,
	DeciderCombinator = 9,
	ArithmeticCombinator = 10,
	ConstantCombinator = 11,
	TransportBelt = 12,
	Accumulator = 13,
	RailSignal = 14,
	Wall = 15,
	MiningDrill = 16,
	ProgrammableSpeaker = 17,
	RailChainSignal = 18,
}

export enum LuaFlowStatisticsType {
	ItemProduction = 1,
	FluidProduction = 2,
	KillCount = 3,
	EntityBuild = 6,
	ElectricNetwork = 7,
	Pollution = 8,
}

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
		this.version = MapVersion.load(b);
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
			MapVersion.load(inner);
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
		const type = SavedLuaTypeTag[typetag];
		switch (type) {
			case "Nil":
			case "BoolFalse":
			case "BoolTrue":
				return { type };
			case "Number": {
				const value = b.readDoubleLE();
				return { type, value };
			}
			case "String": {
				const slen = b.readPackedUInt_8_32();
				const value = b.readString(slen);
				return { type, value };
			}
			case "TableWithMeta":
			case "Table": {
				const thisgcid = this.gcid++;
				let metaname:string|undefined;
				if (type === "TableWithMeta") {
					const metanamelen = b.readPackedUInt_8_32();
					metaname = b.readString(metanamelen);
				}
				const count = b.readPackedUInt_8_32();
				const values = [];
				for (let i = 0; i < count; i++) {
					const key = this.loadLuaValue(b);
					const value = this.loadLuaValue(b);
					values.push({key, value});
				}

				const t = {
					type,
					id: thisgcid,
					values,
					meta: metaname,
				};
				this.gcidmap[thisgcid] = t;
				return t;
			}
			case "ExistingGCObject":
				const id = b.readPackedUInt_16_32();
				return { type, id };
			case "LuaObject": {
				const type = "LuaObject";
				const thisgcid = this.gcid++;
				const ltype = b.readUInt32LE() as LuaObjectType;
				const ltypename = LuaObjectType[ltype] as keyof typeof LuaObjectType;
				const data = this.loadLuaObjectData(ltype, b);
				return { type, id: thisgcid, value: Object.assign({type: ltypename}, data)};
			}
			default:
				throw new Error(`Invalid type ${type} in saved lua value`);
		}
	}

	private loadLuaObjectData(ltype:LuaObjectType, b:BufferStream) {
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
			{
				const target = b.readUInt32LE();
				return { target };
			}
			case LuaObjectType.LuaPermissionGroups:
				return {};
			case LuaObjectType.LuaRecipe:
			case LuaObjectType.LuaTechnology:
			{
				const force = b.readUInt8();
				const id = b.readUInt16LE();
				return { force, id };
			}
			case LuaObjectType.LuaRandomGenerator:
			{
				const seed = [b.readUInt32LE(), b.readUInt32LE(), b.readUInt32LE() ];
				return { seed };
			}
			case LuaObjectType.LuaBurner:
			{
				const entity = b.readUInt32LE();
				const equipment = b.readUInt32LE();
				return { entity, equipment };
			}
			case LuaObjectType.LuaLogisticPoint:
			{
				const index = b.readUInt8();
				const owner = b.readUInt32LE();
				return { index, owner };
			}
			case LuaObjectType.LuaForce:
			case LuaObjectType.LuaDecorativePrototype:
			case LuaObjectType.LuaCustomChartTag:
			case LuaObjectType.LuaTilePrototype:
			case LuaObjectType.LuaDamagePrototype:
			case LuaObjectType.LuaEquipmentGridPrototype:
			case LuaObjectType.LuaAutoplaceControlPrototype:
			case LuaObjectType.LuaAmmoCategoryPrototype:
			case LuaObjectType.LuaFuelCategoryPrototype:
			case LuaObjectType.LuaResourceCategoryPrototype:
			case LuaObjectType.LuaModuleCategoryPrototype:
			case LuaObjectType.LuaEquipmentCategoryPrototype:
			case LuaObjectType.LuaTrivialSmokePrototype:
			{
				const id = b.readUInt8();
				return { id };
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
			{
				const id = b.readUInt16LE();
				return { id };
			}
			case LuaObjectType.LuaNamedNoiseExpression:
			{
				const id = b.readUInt32LE();
				return { id };
			}
			case LuaObjectType.LuaTile:
			{
				const position = {
					x: b.readInt32LE(),
					y: b.readInt32LE(),
				};
				const surface = b.readPackedUInt_8_32();
				return { position, surface };
			}
			case LuaObjectType.LuaGuiElement:
			case LuaObjectType.LuaStyle:
			{
				const player = b.readUInt32LE();
				const index = b.readUInt32LE();
				return { player, index };
			}
			case LuaObjectType.LuaSurface:
			{
				const surface = b.readPackedUInt_8_32();
				return { surface };
			}
			case LuaObjectType.LuaGroup:
			{
				const group = b.readUInt8();
				const subgroup = b.readUInt16LE();
				return { group, subgroup };
			}
			case LuaObjectType.LuaChunkIterator:
			{
				const surface = b.readPackedUInt_8_32();
				const position = {
					x: b.readInt32LE(),
					y: b.readInt32LE(),
				};
				return { surface, position };
			}
			case LuaObjectType.LuaTransportLine:
			{
				const target = b.readUInt32LE();
				const index = b.readUInt8();
				return { target, index };
			}
			case LuaObjectType.LuaInventory:
			{
				const entity = b.readUInt32LE();
				const controller = b.readUInt32LE();
				const item = b.readUInt32LE();
				const equipment = b.readUInt32LE();
				const scriptinv = b.readUInt32LE();
				const linked = b.readUInt8() !== 0;
				let link;
				if (linked) {
					const force = b.readUInt8();
					const proto = b.readUInt16LE();
					const linkid = b.readUInt32LE();
					link = {force, proto, linkid};
				}
				const index = b.readUInt8();
				return { entity, controller, item, equipment, scriptinv, link, index };
			}
			case LuaObjectType.LuaBurnerPrototype:
			case LuaObjectType.LuaElectricEnergySourcePrototype:
			{
				const entity = b.readUInt16LE();
				const equipment = b.readUInt16LE();
				return { entity, equipment };
			}
			case LuaObjectType.LuaFluidBoxPrototype:
			{
				const entity = b.readUInt16LE();
				const index = b.readUInt32LE();
				const targettype = b.readUInt8();
				return { entity, index, targettype };
			}
			case LuaObjectType.LuaProfiler:
			{
				const stopped = b.readUInt8() !== 0;
				return { stopped };
			}
			case LuaObjectType.LuaFontPrototype:
			{
				const hasname = b.readUInt8()!==0;
				let name;
				if (hasname) {
					const slen = b.readPackedUInt_8_32();
					name = b.readString(slen);
				}
				return { name };
			}

			case LuaObjectType.LuaCircuitNetwork:
			{
				const target = b.readUInt32LE();
				const connector = b.readUInt8();
				const wire = b.readUInt8();
				return { target, connector, wire };
			}

			case LuaObjectType.LuaItemStack:
				return this.loadLuaItemStack(b);
			case LuaObjectType.LuaControlBehavior:
				return this.loadLuaControlBehavior(b);
			case LuaObjectType.LuaFlowStatistics:
				return this.loadLuaFlowStatistics(b);

			case LuaObjectType.LuaStructMapSettings:
				throw new Error(`LuaObject of type ${ltype} cannot have been saved`);

			default:
				throw new Error(`Unknown LuaObject type ${ltype}`);
		}
	}

	private loadLuaItemStack(b:BufferStream) {
		const type = b.readUInt32LE() as LuaItemStackType;
		switch (type) {
			case LuaItemStackType.None:
				return { stacktype: LuaItemStackType[type] };
			case LuaItemStackType.EntityInventory:
			case LuaItemStackType.ControllerInventory:
			case LuaItemStackType.ItemWithInventory:
			case LuaItemStackType.Equipment:
			{
				const target = b.readUInt32LE();
				const inv = b.readUInt8();
				const slot = b.readUInt16LE();
				return { stacktype: LuaItemStackType[type], target, inv, slot};
			}
			case LuaItemStackType.ItemEntity:
			case LuaItemStackType.EntityCursorStack:
			case LuaItemStackType.ControllerCursorStack:
			case LuaItemStackType.Inserter:
			case LuaItemStackType.PlayerBlueprint:
			{
				const target = b.readUInt32LE();
				return { stacktype: LuaItemStackType[type], target};
			}
			case LuaItemStackType.BeltConnectable:
			{
				const target = b.readUInt32LE();
				const line = b.readUInt8();
				const item = b.readUInt8();
				return { stacktype: LuaItemStackType[type], target, line, item};
			}
			case LuaItemStackType.TargetableInventory:
				throw new Error(`LuaItemStack type ${type} cannot have been saved`);

			case LuaItemStackType.TargetableItemStack:
				return { stacktype: LuaItemStackType[type] };
			case LuaItemStackType.ScriptInventory:
			{
				const target = b.readUInt32LE();
				const slot = b.readUInt16LE();
				return { stacktype: LuaItemStackType[type], target, slot};
			}
			case LuaItemStackType.LinkedInventory:
			{
				const force = b.readUInt8();
				const proto = b.readUInt16LE();
				const linkid = b.readUInt32LE();
				return { stacktype: LuaItemStackType[type], force, proto, linkid};
			}

			default:
				throw new Error(`Unknown LuaItemStack type ${type}`);

		}
	}

	private loadLuaControlBehavior(b:BufferStream) {
		const type = b.readUInt32LE() as LuaControlBehaviorType;
		const target = b.readUInt32LE();
		return {behavior: LuaControlBehaviorType[type], target};
	}

	private loadLuaFlowStatistics(b:BufferStream) {
		const type = b.readUInt32LE() as LuaFlowStatisticsType;

		switch (type) {
			case LuaFlowStatisticsType.ItemProduction:
			case LuaFlowStatisticsType.FluidProduction:
			case LuaFlowStatisticsType.KillCount:
			case LuaFlowStatisticsType.EntityBuild:
				const force = b.readUInt8();
				return {flow: LuaFlowStatisticsType[type], force};

			case LuaFlowStatisticsType.ElectricNetwork:
				const target = b.readUInt32LE();
				return {flow: LuaFlowStatisticsType[type], target};

			case LuaFlowStatisticsType.Pollution:
				return {flow: LuaFlowStatisticsType[type] };

			default:
				throw new Error(`Unknown LuaFlowStatistics type ${type}`);
		}
	}
}

