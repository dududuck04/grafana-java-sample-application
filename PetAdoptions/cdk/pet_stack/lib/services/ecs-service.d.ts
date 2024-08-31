import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export interface EcsServiceProps {
    cluster?: ecs.Cluster;
    cpu: number;
    memoryLimitMiB: number;
    logGroupName: string;
    healthCheck?: string;
    disableService?: boolean;
    instrumentation?: string;
    repositoryURI?: string;
    desiredTaskCount: number;
    region: string;
    securityGroup: ec2.SecurityGroup;
}
export declare abstract class EcsService extends Construct {
    private static ExecutionRolePolicy;
    readonly taskDefinition: ecs.TaskDefinition;
    readonly service: ecs_patterns.ApplicationLoadBalancedServiceBase;
    readonly container: ecs.ContainerDefinition;
    constructor(scope: Construct, id: string, props: EcsServiceProps);
    abstract containerImageFromRepository(repositoryURI: string): ecs.ContainerImage;
    abstract createContainerImage(): ecs.ContainerImage;
    private addXRayContainer;
    private addOtelCollectorContainer;
}
