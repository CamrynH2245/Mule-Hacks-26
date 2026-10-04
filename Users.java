import javax.swing.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class Users {
    public static void main(String[] args) {
        JFrame frame = new JFrame("Input Example");
        JPanel panel = new JPanel();
        
        // 1. Create the text box (JTextField)
        JTextField textBox = new JTextField(20); 
        
        // 2. Create a submit button
        JButton button = new JButton("Submit");
        
        // 3. Add an action listener to read the text when clicked
        button.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                // Read the string input
                String userInput = textBox.getText(); 
                System.out.println("User entered: " + userInput);
                System.out.printf(
            "===================\n" +
            "    Group names\n" +
            "===================\n" +
            "1) %s\n", userInput);
            }
        });

        panel.add(textBox);
        panel.add(button);
        frame.add(panel);
        frame.setSize(300, 200);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setVisible(true);
    }
}