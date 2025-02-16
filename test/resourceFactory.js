import fs from 'fs-extra';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { Util } from '../lib/util/util.js';
const parser = new XMLParser();
const attributeParser = new XMLParser({ ignoreAttributes: false });
let color;

/* eslint-disable unicorn/prefer-ternary */
if (
    process.env.VSCODE_AMD_ENTRYPOINT === 'vs/workbench/api/node/extensionHostProcess' ||
    process.env.VSCODE_CRASH_REPORTER_PROCESS_TYPE === 'extensionHost'
) {
    // when we execute the test in a VSCode extension host, we don't want CLI color codes.
    color = new Proxy(
        {},
        {
            /**
             * catch-all for color
             *
             * @returns {string} empty string
             */
            get() {
                return '';
            },
        }
    );
} else {
    // test is executed directly in a command prompt. Use colors.
    color = Util.color;
}
/* eslint-enable unicorn/prefer-ternary */

/**
 * gets mock SOAP metadata for responding
 *
 * @param {string} mcdevAction SOAP action
 * @param {string} type metadata Type
 * @param {string} mid of Business Unit
 * @param {object|string} filter likely for customer key
 * @returns {string} relevant metadata stringified
 */
async function loadSOAPRecords(mcdevAction, type, mid, filter) {
    type = type[0].toLowerCase() + type.slice(1);
    const testPath = path.join('test', 'resources', mid.toString(), type, mcdevAction);
    const filterPath = typeof filter === 'string' && filter ? '-' + filter : filterToPath(filter);
    if (await fs.pathExists(testPath + filterPath + '-response.xml')) {
        return fs.readFile(testPath + filterPath + '-response.xml', {
            encoding: 'utf8',
        });
    } else if (await fs.pathExists(testPath + '-response.xml')) {
        if (filterPath) {
            /* eslint-disable no-console */
            console.log(
                `${color.bgYellow}${color.fgBlack}TEST-WARNING${
                    color.reset
                }: You are loading your reponse from ${
                    testPath + '-response.xml'
                } instead of the more specific ${
                    testPath + filterPath + '-response.xml'
                }. Make sure this is intended`
            );
            /* eslint-enable no-console */
        }
        return fs.readFile(testPath + '-response.xml', {
            encoding: 'utf8',
        });
    }
    /* eslint-disable no-console */
    console.log(
        `${color.bgRed}${color.fgBlack}TEST-ERROR${color.reset}: Please create file ${
            filterPath ? testPath + filterPath + '-response.xml or ' : ''
        }${testPath + '-response.xml'}`
    );
    /* eslint-enable no-console */

    // return error
    process.exitCode = 404;
    return fs.readFile(path.join('test', 'resources', mcdevAction + '-response.xml'), {
        encoding: 'utf8',
    });
}
/**
 * main filter to path function
 *
 * @param {object} filter main filter object
 * @param {string} filter.Property field name
 * @param {string} filter.SimpleOperator string representation of the comparison method
 * @param {string} filter.Value field value to check for
 * @param {object} filter.LeftOperand contains a filter object itself
 * @param {'AND'|'OR'} filter.LogicalOperator string representation of the comparison method
 * @param {object} filter.RightOperand field value to check for
 * @returns {string} string represenation of the entire filter
 */
export function filterToPath(filter) {
    if (filter) {
        return '-' + _filterToPath(filter);
    }
    return '';
}
/**
 * helper for filterToPath
 *
 * @param {object} filter main filter object
 * @param {string} filter.Property field name
 * @param {string} filter.SimpleOperator string representation of the comparison method
 * @param {string} filter.Value field value to check for
 * @param {object} filter.LeftOperand contains a filter object itself
 * @param {'AND'|'OR'} filter.LogicalOperator string representation of the comparison method
 * @param {object} filter.RightOperand field value to check for
 * @returns {string} string represenation of the entire filter
 */
function _filterToPath(filter) {
    if (filter.Property && filter.SimpleOperator) {
        return `${filter.Property}${filter.SimpleOperator.replace('equals', '=')}${
            filter.Value === undefined ? '' : filter.Value
        }`;
    } else if (filter.LeftOperand && filter.LogicalOperator && filter.RightOperand) {
        return (
            _filterToPath(filter.LeftOperand) +
            filter.LogicalOperator +
            _filterToPath(filter.RightOperand)
        );
    } else {
        throw new Error('unknown filter type');
    }
}
/**
 * based on request, respond with different soap data
 *
 * @param {object} config mock api request object
 * @returns {Promise.<Array>} status code plus response in string form
 */
export const handleSOAPRequest = async (config) => {
    const jObj = parser.parse(config.data);
    const fullObj = attributeParser.parse(config.data);
    let responseXML;

    switch (config.headers.SOAPAction) {
        case 'Retrieve': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                jObj.Envelope.Body.RetrieveRequestMsg.RetrieveRequest.ObjectType,
                jObj.Envelope.Header.fueloauth,
                jObj.Envelope.Body.RetrieveRequestMsg.RetrieveRequest.Filter
            );

            break;
        }
        case 'Create': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.CreateRequest.Objects['@_xsi:type'],
                jObj.Envelope.Header.fueloauth,
                null
            );

            break;
        }
        case 'Update': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.UpdateRequest.Objects['@_xsi:type'],
                jObj.Envelope.Header.fueloauth,
                null
            );

            break;
        }
        case 'Configure': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.ConfigureRequestMsg.Configurations.Configuration[0][
                    '@_xsi:type'
                ],
                jObj.Envelope.Header.fueloauth,
                null
            );

            break;
        }
        case 'Delete': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.DeleteRequest.Objects['@_xsi:type'],
                jObj.Envelope.Header.fueloauth,
                null
            );

            break;
        }
        case 'Schedule': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.ScheduleRequestMsg.Interactions.Interaction['@_xsi:type'],
                jObj.Envelope.Header.fueloauth,
                fullObj.Envelope.Body.ScheduleRequestMsg.Interactions.Interaction.ObjectID
            );

            break;
        }
        case 'Perform': {
            responseXML = await loadSOAPRecords(
                config.headers.SOAPAction.toLocaleLowerCase(),
                fullObj.Envelope.Body.PerformRequestMsg.Definitions.Definition['@_xsi:type'],
                jObj.Envelope.Header.fueloauth,
                fullObj.Envelope.Body.PerformRequestMsg.Definitions.Definition.ObjectID
            );

            break;
        }
        default: {
            throw new Error(
                `The SOAP Action ${config.headers.SOAPAction} is not supported by test handler`
            );
        }
    }

    return [200, responseXML];
};

/**
 * helper to return soap base URL
 *
 * @returns {string} soap URL
 */
export const soapUrl =
    'https://mct0l7nxfq2r988t1kxfy8sc4xxx.soap.marketingcloudapis.com/Service.asmx';

/**
 * based on request, respond with different soap data
 *
 * @param {object} config mock api request object
 * @returns {Promise.<Array>} status code plus response in string form
 */
export const handleRESTRequest = async (config) => {
    try {
        // check if filtered
        const urlObj = new URL(config.baseURL + config.url.slice(1));
        let filterName;
        if (urlObj.searchParams.get('$filter')) {
            filterName = urlObj.searchParams.get('$filter').split(' eq ')[1];
        }
        const testPath = path
            .join(
                'test',
                'resources',
                config.headers.Authorization.replace('Bearer ', ''),
                urlObj.pathname,
                config.method + '-response'
            )
            .replace(':', '_'); // replace : with _ for Windows

        if (await fs.pathExists(testPath + '.json')) {
            // build filter logic to ensure templating works
            if (filterName) {
                const response = JSON.parse(
                    await fs.readFile(testPath + '.json', {
                        encoding: 'utf8',
                    })
                );
                response.items = response.items.filter((def) => def.name == filterName);
                response.count = response.items.length;
                return [200, JSON.stringify(response)];
            } else {
                return [
                    200,
                    await fs.readFile(testPath + '.json', {
                        encoding: 'utf8',
                    }),
                ];
            }
        } else if (await fs.pathExists(testPath + '.txt')) {
            return [
                200,
                await fs.readFile(testPath + '.txt', {
                    encoding: 'utf8',
                }),
            ];
        } else {
            /* eslint-disable no-console */
            console.log(
                `${color.bgRed}${color.fgBlack}TEST-ERROR${color.reset}: Please create file ${testPath}.json/.txt`
            );
            /* eslint-enable no-console */
            process.exitCode = 404;

            return [
                404,
                await fs.readFile(path.join('test', 'resources', 'rest404-response.json'), {
                    encoding: 'utf8',
                }),
            ];
        }
    } catch {
        return [500, {}];
    }
};

/**
 * helper to return rest base URL
 *
 * @returns {string} test URL
 */
export const restUrl = 'https://mct0l7nxfq2r988t1kxfy8sc4xxx.rest.marketingcloudapis.com/';
