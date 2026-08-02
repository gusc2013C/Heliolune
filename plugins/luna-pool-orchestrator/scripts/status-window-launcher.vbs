Option Explicit

If WScript.Arguments.Count < 3 Then
    WScript.Quit 2
End If

Function QuoteArgument(value)
    QuoteArgument = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

Dim command
Dim powerShell
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Environment("PROCESS")("windir") = shell.ExpandEnvironmentStrings("%SystemRoot%")
powerShell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = QuoteArgument(powerShell) & " -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File " & _
    QuoteArgument(WScript.Arguments(0)) & " -JobId " & QuoteArgument(WScript.Arguments(1)) & _
    " -JobRoot " & QuoteArgument(WScript.Arguments(2))

shell.Run command, 0, False
