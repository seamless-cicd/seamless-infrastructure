export type ServiceOptions = {
  name: string;
  serviceDiscoveryName: string;
  image: string;
  port: number;
  addToAlbTargetGroup: boolean;
  environment?: Record<string, string>;
};
