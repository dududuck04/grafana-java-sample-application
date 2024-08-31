import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { EcsService, EcsServiceProps } from './ecs-service';
import { Construct } from 'constructs';
export interface PayForAdoptionServiceProps extends EcsServiceProps {
    database: rds.ServerlessCluster;
}
export declare class PayForAdoptionService extends EcsService {
    constructor(scope: Construct, id: string, props: PayForAdoptionServiceProps);
    containerImageFromRepository(repositoryURI: string): ecs.ContainerImage;
    createContainerImage(): ecs.ContainerImage;
}
