/*
 *  This file is part of the SIRIUS Software for analyzing MS and MS/MS data
 *
 *  Copyright (C) 2013-2020 Kai Dührkop, Markus Fleischauer, Marcus Ludwig, Martin A. Hoffman, Fleming Kretschmer, Marvin Meusel and Sebastian Böcker,
 *  Chair of Bioinformatics, Friedrich-Schiller University.
 *
 *  This program is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Affero General Public License
 *  as published by the Free Software Foundation; either
 *  version 3 of the License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License along with SIRIUS.  If not, see <https://www.gnu.org/licenses/agpl-3.0.txt>
 */

package de.unijena.bioinf.ms.gui.actions;

import de.unijena.bioinf.ms.gui.configs.Icons;
import de.unijena.bioinf.ms.gui.dialogs.ExecutionDialog;
import de.unijena.bioinf.ms.gui.subtools.summaries.SummaryConfigPanel;

import javax.swing.*;
import java.awt.event.ActionEvent;
import java.util.List;

import static de.unijena.bioinf.ms.gui.mainframe.MainFrame.MF;

public class ProjectSummaryAction extends AbstractAction {

    public ProjectSummaryAction() {
        super("Summaries");
        putValue(Action.LARGE_ICON_KEY, Icons.EXPORT_32);
        putValue(Action.SHORT_DESCRIPTION, "Write Summary .tsv files to project.");
        setEnabled(true);
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        ExecutionDialog<SummaryConfigPanel> d = new ExecutionDialog<>(new SummaryConfigPanel(), List.copyOf(MF.getCompounds()), null, MF, "Write Project Summaries", true);
        d.setIndeterminateProgress(false);
        d.start();
    }
}
