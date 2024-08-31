import * as ecs from 'aws-cdk-lib/aws-ecs';
import { EcsService, EcsServiceProps } from './ecs-service';
import { Construct } from 'constructs';
export declare class SearchService extends EcsService {
    constructor(scope: Construct, id: string, props: EcsServiceProps);
    containerImageFromRepository(repositoryURI: string): ecs.ContainerImage;
    createContainerImage(): ecs.ContainerImage;
}
