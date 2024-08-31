import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { EcsService, EcsServiceProps } from './ecs-service';
import { Construct } from 'constructs';
export interface ListAdoptionServiceProps extends EcsServiceProps {
    database: rds.ServerlessCluster;
}
export declare class ListAdoptionsService extends EcsService {
    constructor(scope: Construct, id: string, props: ListAdoptionServiceProps);
    containerImageFromRepository(repositoryURI: string): ecs.ContainerImage;
    createContainerImage(): ecs.ContainerImage;
}
