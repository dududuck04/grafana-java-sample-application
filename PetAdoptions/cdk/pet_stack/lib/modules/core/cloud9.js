"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cloud9Environment = void 0;
const constructs_1 = require("constructs");
const cloudformation_include = require("aws-cdk-lib/cloudformation-include");
class Cloud9Environment extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const template = new cloudformation_include.CfnInclude(this, 'Cloud9Template', {
            templateFile: props.templateFile,
            parameters: {
                'CreateVPC': false,
                'Cloud9VPC': props.vpcId,
                'Cloud9Subnet': props.subnetId
            },
            preserveLogicalIds: false
        });
        if (props.name) {
            template.getParameter("EnvironmentName").default = props.name;
        }
        if (props.cloud9OwnerArn) {
            template.getParameter("Cloud9OwnerRole").default = props.cloud9OwnerArn.valueOf();
        }
        this.c9Role = template.getResource("C9Role");
    }
}
exports.Cloud9Environment = Cloud9Environment;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xvdWQ5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2xvdWQ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2Qyw2RUFBNkU7QUFXN0UsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUU1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxRQUFRLEdBQUcsSUFBSyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQzVFLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWTtZQUNoQyxVQUFVLEVBQUU7Z0JBQ1IsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLFdBQVcsRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDeEIsY0FBYyxFQUFFLEtBQUssQ0FBQyxRQUFRO2FBQ2pDO1lBQ0Qsa0JBQWtCLEVBQUUsS0FBSztTQUM1QixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUU7WUFDWixRQUFRLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7U0FDakU7UUFFRCxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUU7WUFDdEIsUUFBUSxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQ3JGO1FBRUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBWSxDQUFDO0lBRTVELENBQUM7Q0FDSjtBQTFCRCw4Q0EwQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgY2xvdWRmb3JtYXRpb25faW5jbHVkZSBmcm9tIFwiYXdzLWNkay1saWIvY2xvdWRmb3JtYXRpb24taW5jbHVkZVwiO1xuaW1wb3J0IHsgQ2ZuUm9sZSB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xvdWQ5RW52aXJvbm1lbnRQcm9wcyB7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICB2cGNJZDogc3RyaW5nO1xuICAgIHN1Ym5ldElkOiBzdHJpbmc7XG4gICAgdGVtcGxhdGVGaWxlOiBzdHJpbmc7XG4gICAgY2xvdWQ5T3duZXJBcm4/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBDbG91ZDlFbnZpcm9ubWVudCBleHRlbmRzIENvbnN0cnVjdCB7XG4gICAgcHVibGljIHJlYWRvbmx5IGM5Um9sZTogQ2ZuUm9sZTtcbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQ2xvdWQ5RW52aXJvbm1lbnRQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gbmV3ICBjbG91ZGZvcm1hdGlvbl9pbmNsdWRlLkNmbkluY2x1ZGUodGhpcywgJ0Nsb3VkOVRlbXBsYXRlJywge1xuICAgICAgICAgICAgdGVtcGxhdGVGaWxlOiBwcm9wcy50ZW1wbGF0ZUZpbGUsXG4gICAgICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0NyZWF0ZVZQQyc6IGZhbHNlLFxuICAgICAgICAgICAgICAgICdDbG91ZDlWUEMnOiBwcm9wcy52cGNJZCxcbiAgICAgICAgICAgICAgICAnQ2xvdWQ5U3VibmV0JzogcHJvcHMuc3VibmV0SWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcmVzZXJ2ZUxvZ2ljYWxJZHM6IGZhbHNlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChwcm9wcy5uYW1lKSB7XG4gICAgICAgICAgICB0ZW1wbGF0ZS5nZXRQYXJhbWV0ZXIoXCJFbnZpcm9ubWVudE5hbWVcIikuZGVmYXVsdCA9IHByb3BzLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcHMuY2xvdWQ5T3duZXJBcm4pIHtcbiAgICAgICAgICAgIHRlbXBsYXRlLmdldFBhcmFtZXRlcihcIkNsb3VkOU93bmVyUm9sZVwiKS5kZWZhdWx0ID0gcHJvcHMuY2xvdWQ5T3duZXJBcm4udmFsdWVPZigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jOVJvbGUgPSB0ZW1wbGF0ZS5nZXRSZXNvdXJjZShcIkM5Um9sZVwiKSBhcyBDZm5Sb2xlO1xuXG4gICAgfVxufSJdfQ==