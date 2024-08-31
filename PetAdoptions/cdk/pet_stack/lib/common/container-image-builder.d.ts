/**
 * Create a container image from Dockerfile and make it available
 * on a dedicated ECR repository (by default, CDK places all of the
 * container images in the same "CDK Assets" ECR repository)
 *
 * Behind the scenes, this is what happens:
 * 1. The container image is built locally and pushed into the "CDK Assets" ECR repository
 * 2. A dedicated ECR repository is created
 * 3. The container image is copied from "CDK Assets" to the dedicated repository
 */
import { Construct } from 'constructs';
export interface ContainerImageBuilderProps {
    repositoryName: string;
    dockerImageAssetDirectory: string;
}
export declare class ContainerImageBuilder extends Construct {
    repositoryUri: string;
    imageUri: string;
    constructor(scope: Construct, id: string, props: ContainerImageBuilderProps);
}
