Option Explicit

If WScript.Arguments.Count < 3 Then
    WScript.Quit 2
End If

Function QuoteArgument(value)
    QuoteArgument = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

Dim command
Dim shell
Set shell = CreateObject("WScript.Shell")
command = QuoteArgument(WScript.Arguments(0)) & " " & _
    QuoteArgument(WScript.Arguments(1)) & " " & QuoteArgument(WScript.Arguments(2))

shell.Run command, 0, False
