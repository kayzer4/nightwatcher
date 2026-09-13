import { Building } from "@/shared/engine/Building";

export interface City {
  id: string;
  name: string;
  buildings: Building[];
  createdAt: Date;
  updatedAt: Date;
}
