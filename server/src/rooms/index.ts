import { WorldRoom } from './WorldRoom';

/** Safe-zone town with the Teleport Gate plaza, shops later. */
export class TownRoom extends WorldRoom {
  protected mapId = 'town';
}

/** Open field and (later) the labyrinth. */
export class FieldRoom extends WorldRoom {
  protected mapId = 'field';
}

/** Instanced boss raid: one party of up to 4 humans plus companions. */
export class BossRoom extends WorldRoom {
  protected mapId = 'boss';
  override maxClients = 4;
}
