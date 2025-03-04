/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deleteCertCommand } from '../../../iot/commands/deleteCert'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

describe('deleteCertCommand', function () {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    const certificateId = 'test-cert'
    const status = 'INACTIVE'
    let iot: IotClient
    let node: IotCertWithPoliciesNode
    let parentNode: IotCertsFolderNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
        iot = mock()
        parentNode = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: status, creationDate: new globals.clock.Date() },
            parentNode,
            instance(iot)
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes cert, and refreshes node', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({ policies: [] })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Certificate test-cert?')

        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: false }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing if things are attached', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve(['iot-thing'])

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Certificate has attached resources: iot-thing/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('does nothing when deletion is cancelled', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deleteCertCommand(node)

        verify(iot.deleteCertificate(anything())).never()
    })

    it('does nothing if certificate is active', async function () {
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            parentNode,
            instance(iot)
        )
        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        await deleteCertCommand(node)

        verify(iot.deleteCertificate(anything())).never()
    })

    it('shows an error message and refreshes node when certificate deletion fails', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({ policies: [] })
        when(iot.deleteCertificate(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete certificate: test-cert/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message if Things are not fetched', async function () {
        when(iot.listThingsForCert(anything())).thenReject(new Error('Expected failure'))

        await deleteCertCommand(node)

        verify(iot.deleteCertificate(anything())).never()

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to retrieve Things attached to certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('confirms force deletion if policies are attached', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({
            policies: [{ policyName: 'policy' }],
        })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getSecondMessage().assertWarn('Certificate has attached policies. Delete anyway?')

        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: true }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message but refreshes node if policies are not fetched', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getSecondMessage().assertError('Failed to retrieve policies attached to certificate')
        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: false }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
