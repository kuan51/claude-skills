# Synthetic fixture module. Does nothing real.
function Invoke-CertRotation {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$HubName)
    if ($PSCmdlet.ShouldProcess($HubName, 'Rotate client certificate')) {
        Write-Output "rotated $HubName"
    }
}
Export-ModuleMember -Function Invoke-CertRotation
